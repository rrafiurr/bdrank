package feedback

import (
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"final-review/be/internal/ratelimit"
)

func TestClean(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"crlf and lone cr become lf", "line one\r\nline two\rline three", "line one\nline two\nline three"},
		{"tab becomes space", "a\tb", "a b"},
		{"control characters removed", "a\x00b\x1bc\x7fd", "abcd"},
		{"zero-width joiner and non-joiner kept", "র\u200d্য ক\u200cষ", "র\u200d্য ক\u200cষ"},
		{"blank lines collapse to one", "a\n\n\n\n\nb", "a\n\nb"},
		{"whitespace-only lines collapse too", "a\n   \n\t\n  \nb", "a\n\nb"},
		{"outer whitespace trimmed", "  \n hello \n  ", "hello"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Clean(c.in); got != c.want {
				t.Errorf("Clean(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}

	t.Run("invalid utf-8 becomes valid", func(t *testing.T) {
		if got := Clean("ok \xff\xfe ok"); !utf8.ValidString(got) {
			t.Errorf("Clean produced invalid UTF-8: %q", got)
		}
	})
}

// bangla20 is 20 distinct Bangla letters: 20 runes but 60 bytes, so it tells
// rune counting apart from byte counting.
const bangla20 = "অআইঈউঊঋএঐওঔকখগঘঙচছজঝ"

func TestValidate(t *testing.T) {
	if n := utf8.RuneCountInString(bangla20); n != 20 {
		t.Fatalf("fixture has %d runes, want 20", n)
	}
	longOK := strings.Repeat("abcdefghij", 200) // 2000 runes

	cases := []struct{ name, in, wantCode string }{
		{"19 runes is too short", "abcdefghijklmnopqrs", CodeTooShort},
		{"20 runes is fine", "abcdefghijklmnopqrst", ""},
		{"19 Bangla runes is too short even at 57 bytes", string([]rune(bangla20)[:19]), CodeTooShort},
		{"20 Bangla runes is fine", bangla20, ""},
		{"length is counted after cleaning", "   abcdefghijklmnopqrs   ", CodeTooShort},
		{"2000 runes is fine", longOK, ""},
		{"2001 runes is too long", longOK + "k", CodeTooLong},
		{"one repeated character", strings.Repeat("a", 30), CodeLowEffort},
		{"five distinct characters", "abcde abcde abcde abcde", CodeLowEffort},
		{"six distinct characters", "abcdef abcdef abcdef", ""},
		{"two links are fine", "see https://a.example and www.b.example please", ""},
		{"scheme plus www counts as one link", "see https://www.a.example and https://www.b.example", ""},
		{"three links", "see https://a.example http://b.example www.c.example now", CodeTooManyLinks},
		{"comma-joined links count separately", "see https://a.example,http://b.example,www.c.example now", CodeTooManyLinks},
		{"semicolon-joined links count separately", "links: www.a.example;www.b.example;www.c.example ok", CodeTooManyLinks},
		{"two scheme-plus-www links joined by a comma are fine", "see https://www.a.example,https://www.b.example please", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, code := Validate(c.in); code != c.wantCode {
				t.Errorf("Validate(%.30q) code = %q, want %q", c.in, code, c.wantCode)
			}
		})
	}

	t.Run("returns the cleaned text", func(t *testing.T) {
		got, code := Validate("  The checkout button does nothing.\r\n\r\n\r\nPlease fix  ")
		if code != "" {
			t.Fatalf("code = %q, want accepted", code)
		}
		if want := "The checkout button does nothing.\n\nPlease fix"; got != want {
			t.Errorf("cleaned = %q, want %q", got, want)
		}
	})
}

func TestFingerprint(t *testing.T) {
	a := Fingerprint("Hello   World,\nthe app crashed")
	b := Fingerprint("hello world, the APP crashed")
	if a != b {
		t.Errorf("case and spacing changed the fingerprint: %s vs %s", a, b)
	}
	if len(a) != 64 {
		t.Errorf("len = %d, want 64 hex characters", len(a))
	}
	if a == Fingerprint("hello world, the app froze") {
		t.Error("different text produced the same fingerprint")
	}
}

func TestCleanPagePath(t *testing.T) {
	cases := []struct{ in, want string }{
		{"/review/12", "/review/12"},
		{"  /browse?q=phone  ", "/browse?q=phone"},
		{"", ""},
		{"review/12", ""},
		{"//evil.example/x", ""},
		{"/\\evil.example", ""},
		{"https://evil.example/", ""},
		{"/a\x00b", ""},
		{"/" + strings.Repeat("a", 299), "/" + strings.Repeat("a", 299)}, // 300 runes
		{"/" + strings.Repeat("a", 300), ""},                             // 301 runes
	}
	for _, c := range cases {
		if got := CleanPagePath(c.in); got != c.want {
			t.Errorf("CleanPagePath(%.40q) = %.40q, want %.40q", c.in, got, c.want)
		}
	}
}

func TestCleanUserAgent(t *testing.T) {
	if got := CleanUserAgent(strings.Repeat("x", 300)); utf8.RuneCountInString(got) != MaxUserAgent {
		t.Errorf("long UA kept %d runes, want %d", utf8.RuneCountInString(got), MaxUserAgent)
	}
	if got := CleanUserAgent("Mozilla\xff/5.0"); got != "Mozilla/5.0" {
		t.Errorf("CleanUserAgent = %q, want invalid bytes dropped", got)
	}
}

func TestCleanReply(t *testing.T) {
	if got, code := CleanReply("  Thanks, fixed.  "); got != "Thanks, fixed." || code != "" {
		t.Errorf("CleanReply = (%q, %q), want trimmed and accepted", got, code)
	}
	if got, code := CleanReply("   "); got != "" || code != "" {
		t.Errorf("blank reply = (%q, %q), want empty and accepted: it clears the reply", got, code)
	}
	if _, code := CleanReply(strings.Repeat("a", MaxReply+1)); code != CodeInvalidReply {
		t.Errorf("over-long reply code = %q, want %q", code, CodeInvalidReply)
	}
}

func TestPublicStatus(t *testing.T) {
	for in, want := range map[string]string{"new": "new", "in_progress": "in_progress", "resolved": "resolved", "spam": "closed"} {
		if got := PublicStatus(in); got != want {
			t.Errorf("PublicStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidTypeAndStatus(t *testing.T) {
	for _, ok := range []string{"bug", "idea", "complaint", "praise", "other"} {
		if !ValidType(ok) {
			t.Errorf("ValidType(%q) = false", ok)
		}
	}
	for _, ok := range []string{"new", "in_progress", "resolved", "spam"} {
		if !ValidStatus(ok) {
			t.Errorf("ValidStatus(%q) = false", ok)
		}
	}
	for _, bad := range []string{"", "Bug", "closed", "rant"} {
		if ValidType(bad) || ValidStatus(bad) {
			t.Errorf("%q accepted as a type or status", bad)
		}
	}
}

func TestAdmission(t *testing.T) {
	cases := []struct {
		name            string
		spam, dup, open int
		want            string
	}{
		{"clean history", 0, 0, 0, ""},
		{"two spam is not yet a pause", 2, 0, 0, ""},
		{"three spam pauses", 3, 0, 0, CodePaused},
		{"pause wins over duplicate and open", 3, 1, 10, CodePaused},
		{"duplicate", 0, 1, 0, CodeDuplicate},
		{"duplicate wins over open", 0, 1, 10, CodeDuplicate},
		{"nine open is fine", 0, 0, 9, ""},
		{"ten open blocks", 0, 0, 10, CodeTooManyOpen},
	}
	for _, c := range cases {
		if got := Admission(c.spam, c.dup, c.open); got != c.want {
			t.Errorf("%s: Admission(%d, %d, %d) = %q, want %q", c.name, c.spam, c.dup, c.open, got, c.want)
		}
	}
}

// The cooldown is load-bearing: the handler's MySQL checks skip locking
// because it lets at most one of a user's requests through per minute.
func TestRateRules(t *testing.T) {
	want := []ratelimit.Rule{
		{Name: "cooldown", Limit: 1, Window: time.Minute},
		{Name: "daily", Limit: 5, Window: 24 * time.Hour},
	}
	if len(RateRules) != len(want) || RateRules[0] != want[0] || RateRules[1] != want[1] {
		t.Errorf("RateRules = %+v, want %+v", RateRules, want)
	}
}
