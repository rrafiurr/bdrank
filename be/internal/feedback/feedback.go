// Package feedback holds the rules for user feedback: what a valid message
// is, how it is cleaned before storage, when a user may send more, and the
// error codes clients receive. Everything here is pure, so it can be tested
// without a database. The numbers are product decisions recorded in
// docs/superpowers/specs/2026-09-11-user-feedback-design.md.
package feedback

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"final-review/be/internal/ratelimit"
)

const (
	MinLength    = 20   // runes, after cleaning
	MaxLength    = 2000 // runes, after cleaning
	MinDistinct  = 6    // distinct non-space characters
	MaxLinks     = 2
	MaxPagePath  = 300
	MaxUserAgent = 255
	MaxReply     = 2000

	SpamPauseThreshold  = 3 // spam-marked items within SpamWindowDays pause the user
	SpamWindowDays      = 30
	DuplicateWindowDays = 30
	MaxOpen             = 10 // items still new or in progress, per user
)

// RateRules are the limits on sending feedback, enforced in Redis by
// middleware.RateLimitPerUser.
//
// The cooldown also serializes each user's submissions: at most one of their
// requests gets past the limiter per minute, which is what lets the MySQL
// admission checks run without locking. If the cooldown is ever removed,
// AdmissionCounts and Create must move into one transaction that locks the
// user's row (see be/internal/rewards/repo.go for the pattern).
var RateRules = []ratelimit.Rule{
	{Name: "cooldown", Limit: 1, Window: time.Minute},
	{Name: "daily", Limit: 5, Window: 24 * time.Hour},
}

// Error codes. They are part of the API contract: the frontend maps each one
// to a translated message, so renaming one is a breaking change.
const (
	CodeInvalidBody   = "invalid_body"
	CodeInvalidType   = "invalid_type"
	CodeTooShort      = "message_too_short"
	CodeTooLong       = "message_too_long"
	CodeLowEffort     = "message_low_effort"
	CodeTooManyLinks  = "too_many_links"
	CodePaused        = "paused"
	CodeDuplicate     = "duplicate"
	CodeTooManyOpen   = "too_many_open"
	CodeInvalidStatus = "invalid_status"
	CodeInvalidReply  = "invalid_reply"
)

var (
	types    = map[string]bool{"bug": true, "idea": true, "complaint": true, "praise": true, "other": true}
	statuses = map[string]bool{"new": true, "in_progress": true, "resolved": true, "spam": true}

	// linkStart matches where a link begins. A "www." that begins exactly where
	// a matched scheme ended belongs to that link, so countLinks skips it: this
	// keeps "https://www.example.com" at one link, while links joined by commas
	// or semicolons still count separately.
	linkStart = regexp.MustCompile(`(?i)https?://|www\.`)
	blankRuns = regexp.MustCompile(`\n{3,}`)
)

func ValidType(t string) bool   { return types[t] }
func ValidStatus(s string) bool { return statuses[s] }

// Clean normalizes user text before it is validated or stored:
//   - CRLF and lone CR become LF, and tabs become spaces
//   - control characters (Unicode Cc) other than LF are removed. Zero-width
//     joiner and non-joiner are format characters (Cf), not controls, so
//     they are kept: Bangla needs them inside conjuncts
//   - invalid UTF-8 becomes U+FFFD, so MySQL never rejects the row
//   - trailing spaces are trimmed from each line, the whole text is trimmed,
//     and three or more newlines in a row collapse to two
func Clean(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s { // ranging decodes invalid bytes as U+FFFD
		switch {
		case r == '\n':
			b.WriteRune(r)
		case r == '\t':
			b.WriteByte(' ')
		case unicode.IsControl(r):
			// dropped
		default:
			b.WriteRune(r)
		}
	}
	lines := strings.Split(b.String(), "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRightFunc(line, unicode.IsSpace)
	}
	out := strings.TrimSpace(strings.Join(lines, "\n"))
	return blankRuns.ReplaceAllString(out, "\n\n")
}

// Validate cleans message and checks it against the content rules. It returns
// the cleaned text and "" when the message is acceptable, or an error code.
func Validate(message string) (string, string) {
	m := Clean(message)
	n := utf8.RuneCountInString(m)
	switch {
	case n < MinLength:
		return m, CodeTooShort
	case n > MaxLength:
		return m, CodeTooLong
	case distinctNonSpace(m) < MinDistinct:
		return m, CodeLowEffort
	case countLinks(m) > MaxLinks:
		return m, CodeTooManyLinks
	}
	return m, ""
}

func distinctNonSpace(s string) int {
	seen := map[rune]struct{}{}
	for _, r := range s {
		if !unicode.IsSpace(r) {
			seen[r] = struct{}{}
		}
	}
	return len(seen)
}

// countLinks counts the links in s by where each one starts. A "www." that
// begins exactly where a matched http:// or https:// ended is that link's
// host, not a second link; any other "www." (including one after a made-up
// "xyz://") counts on its own.
func countLinks(s string) int {
	n := 0
	schemeEnd := -1 // end offset of the last matched http:// or https://
	for _, loc := range linkStart.FindAllStringIndex(s, -1) {
		if loc[1]-loc[0] == len("www.") {
			if loc[0] == schemeEnd {
				continue
			}
		} else {
			schemeEnd = loc[1]
		}
		n++
	}
	return n
}

// Fingerprint identifies a message for the duplicate check. It is the SHA-256
// of the text lowercased with every run of whitespace collapsed to one space,
// so resending with different capitalization or spacing still matches.
func Fingerprint(cleaned string) string {
	norm := strings.Join(strings.Fields(strings.ToLower(cleaned)), " ")
	sum := sha256.Sum256([]byte(norm))
	return hex.EncodeToString(sum[:])
}

// CleanPagePath returns p when it is a safe same-site path to store, else "".
// It must start with a single "/" (so "//host" and "https://host" are
// refused), contain no backslash or control character, and fit the column.
// A bad path is dropped rather than failing the request: it is context, not
// the feedback itself.
func CleanPagePath(p string) string {
	p = strings.TrimSpace(p)
	if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.ContainsRune(p, '\\') {
		return ""
	}
	if utf8.RuneCountInString(p) > MaxPagePath {
		return ""
	}
	for _, r := range p {
		if unicode.IsControl(r) || r == utf8.RuneError {
			return ""
		}
	}
	return p
}

// CleanUserAgent makes a User-Agent header safe to store: valid UTF-8,
// truncated to the column width.
func CleanUserAgent(ua string) string {
	return truncateRunes(strings.ToValidUTF8(strings.TrimSpace(ua), ""), MaxUserAgent)
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// CleanReply prepares an admin reply. An empty result is valid and means
// "remove the reply"; otherwise it may not exceed MaxReply runes.
func CleanReply(s string) (string, string) {
	r := Clean(s)
	if utf8.RuneCountInString(r) > MaxReply {
		return r, CodeInvalidReply
	}
	return r, ""
}

// PublicStatus is the status users see on their own items. Spam is shown as
// "closed": telling someone they were flagged invites an argument and
// teaches nothing.
func PublicStatus(s string) string {
	if s == "spam" {
		return "closed"
	}
	return s
}

// Admission decides from the user's history whether a new item may be
// stored. The order matters: a paused user learns nothing else.
func Admission(spamRecent, duplicates, open int) string {
	switch {
	case spamRecent >= SpamPauseThreshold:
		return CodePaused
	case duplicates > 0:
		return CodeDuplicate
	case open >= MaxOpen:
		return CodeTooManyOpen
	}
	return ""
}
