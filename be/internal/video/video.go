// Package video turns a user-submitted video link into an embeddable player
// URL, accepting only hosts on a fixed allowlist.
//
// The allowlist is the security boundary: an embed URL derived here ends up in
// an iframe src on the site, so an arbitrary URL would be arbitrary
// third-party code on the page. Clients may pre-check a link for a friendlier
// error, but only the result of Parse is ever stored or rendered.
package video

import (
	"errors"
	"net/url"
	"regexp"
	"strings"
)

// ErrUnsupported means the link is not a recognizable video on a supported
// platform. Callers surface this to the submitter as a 400.
var ErrUnsupported = errors.New("unsupported video link")

// Video is a parsed link: the original URL the user submitted, plus what is
// needed to render a player for it.
type Video struct {
	URL      string `json:"url"`
	Provider string `json:"provider"`
	VideoID  string `json:"video_id"`
	EmbedURL string `json:"embed_url"`
}

// hostProvider maps an exact hostname to its provider. Exact matching (rather
// than a suffix check) is what keeps youtube.com.evil.example out.
var hostProvider = map[string]string{
	"youtube.com":         "youtube",
	"www.youtube.com":     "youtube",
	"m.youtube.com":       "youtube",
	"youtu.be":            "youtube",
	"www.youtu.be":        "youtube",
	"vimeo.com":           "vimeo",
	"www.vimeo.com":       "vimeo",
	"player.vimeo.com":    "vimeo",
	"dailymotion.com":     "dailymotion",
	"www.dailymotion.com": "dailymotion",
	"dai.ly":              "dailymotion",
	"tiktok.com":          "tiktok",
	"www.tiktok.com":      "tiktok",
	"instagram.com":       "instagram",
	"www.instagram.com":   "instagram",
	"facebook.com":        "facebook",
	"www.facebook.com":    "facebook",
	"web.facebook.com":    "facebook",
	"m.facebook.com":      "facebook",
	"fb.watch":            "facebook",
}

var (
	reYouTubeID     = regexp.MustCompile(`^[A-Za-z0-9_-]{6,20}$`)
	reDigits        = regexp.MustCompile(`^[0-9]{1,25}$`)
	reDailymotionID = regexp.MustCompile(`^[A-Za-z0-9]{5,20}$`)
	reInstagramCode = regexp.MustCompile(`^[A-Za-z0-9_-]{5,30}$`)
	reFacebookCode  = regexp.MustCompile(`^[A-Za-z0-9_-]{5,40}$`)
)

// Parse validates raw and derives its embed URL, or returns ErrUnsupported.
func Parse(raw string) (Video, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return Video{}, ErrUnsupported
	}

	u, err := url.Parse(raw)
	// https only: an http embed would be blocked as mixed content anyway, and
	// silently upgrading a link the user did not write invites surprises.
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return Video{}, ErrUnsupported
	}

	provider, ok := hostProvider[strings.ToLower(u.Hostname())]
	if !ok {
		return Video{}, ErrUnsupported
	}

	segs := pathSegments(u.Path)
	v := Video{URL: raw, Provider: provider}

	switch provider {
	case "youtube":
		v.VideoID, ok = youTubeID(u, segs)
		if ok {
			v.EmbedURL = "https://www.youtube-nocookie.com/embed/" + v.VideoID
		}
	case "vimeo":
		// vimeo.com/<id> and player.vimeo.com/video/<id>
		if len(segs) == 2 && segs[0] == "video" {
			segs = segs[1:]
		}
		ok = len(segs) == 1 && reDigits.MatchString(segs[0])
		if ok {
			v.VideoID = segs[0]
			v.EmbedURL = "https://player.vimeo.com/video/" + v.VideoID
		}
	case "dailymotion":
		// dailymotion.com/video/<id> and dai.ly/<id>
		if len(segs) == 2 && segs[0] == "video" {
			segs = segs[1:]
		}
		ok = len(segs) == 1 && reDailymotionID.MatchString(segs[0])
		if ok {
			v.VideoID = segs[0]
			v.EmbedURL = "https://www.dailymotion.com/embed/video/" + v.VideoID
		}
	case "tiktok":
		// tiktok.com/@user/video/<id>
		ok = len(segs) == 3 && strings.HasPrefix(segs[0], "@") && segs[1] == "video" && reDigits.MatchString(segs[2])
		if ok {
			v.VideoID = segs[2]
			v.EmbedURL = "https://www.tiktok.com/embed/v2/" + v.VideoID
		}
	case "instagram":
		// instagram.com/{p,reel,tv}/<code>/ — the kind is part of the embed path.
		ok = len(segs) == 2 && (segs[0] == "p" || segs[0] == "reel" || segs[0] == "tv") && reInstagramCode.MatchString(segs[1])
		if ok {
			v.VideoID = segs[1]
			v.EmbedURL = "https://www.instagram.com/" + segs[0] + "/" + v.VideoID + "/embed"
		}
	case "facebook":
		v.VideoID, ok = facebookID(u, segs)
		if ok {
			// The video plugin takes the original permalink; Facebook resolves
			// it server-side, so there is no per-shape embed path to build.
			v.EmbedURL = "https://www.facebook.com/plugins/video.php?href=" + url.QueryEscape(raw) + "&show_text=false"
		}
	}

	if !ok || v.VideoID == "" {
		return Video{}, ErrUnsupported
	}
	return v, nil
}

func youTubeID(u *url.URL, segs []string) (string, bool) {
	var id string
	switch {
	case strings.HasSuffix(strings.ToLower(u.Hostname()), "youtu.be"):
		if len(segs) == 1 {
			id = segs[0]
		}
	case len(segs) == 1 && segs[0] == "watch":
		id = u.Query().Get("v")
	case len(segs) == 2 && (segs[0] == "shorts" || segs[0] == "live" || segs[0] == "embed" || segs[0] == "v"):
		id = segs[1]
	}
	return id, reYouTubeID.MatchString(id)
}

func facebookID(u *url.URL, segs []string) (string, bool) {
	// fb.watch/<code>/
	if strings.ToLower(u.Hostname()) == "fb.watch" {
		if len(segs) == 1 && reFacebookCode.MatchString(segs[0]) {
			return segs[0], true
		}
		return "", false
	}
	// facebook.com/watch/?v=<id>
	if len(segs) >= 1 && segs[0] == "watch" {
		id := u.Query().Get("v")
		return id, reDigits.MatchString(id)
	}
	// facebook.com/<page>/videos/<id>, optionally with a slug segment, and
	// facebook.com/reel/<id>
	for i, s := range segs {
		if (s == "videos" || s == "reel") && i+1 < len(segs) {
			id := segs[len(segs)-1]
			if reDigits.MatchString(id) {
				return id, true
			}
			return "", false
		}
	}
	return "", false
}

// pathSegments splits a URL path into its non-empty segments.
func pathSegments(p string) []string {
	var out []string
	for _, s := range strings.Split(p, "/") {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

// ParseOrNil is Parse for the read path: a stored URL that no longer parses
// (an allowlist change, a hand-edited row) degrades to "no video" rather than
// failing the response it belongs to.
func ParseOrNil(raw string) *Video {
	v, err := Parse(raw)
	if err != nil {
		return nil
	}
	return &v
}
