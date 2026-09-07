package video

import "testing"

func TestParseSupportedLinks(t *testing.T) {
	cases := []struct {
		name     string
		raw      string
		provider string
		id       string
		embed    string
	}{
		{
			name:     "youtube watch url",
			raw:      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
			provider: "youtube",
			id:       "dQw4w9WgXcQ",
			embed:    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
		},
		{
			name:     "youtube watch url with extra params",
			raw:      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123",
			provider: "youtube",
			id:       "dQw4w9WgXcQ",
			embed:    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
		},
		{
			name:     "youtu.be short link",
			raw:      "https://youtu.be/dQw4w9WgXcQ?si=abc",
			provider: "youtube",
			id:       "dQw4w9WgXcQ",
			embed:    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
		},
		{
			name:     "youtube shorts",
			raw:      "https://www.youtube.com/shorts/abc123XYZ_-",
			provider: "youtube",
			id:       "abc123XYZ_-",
			embed:    "https://www.youtube-nocookie.com/embed/abc123XYZ_-",
		},
		{
			name:     "youtube live",
			raw:      "https://www.youtube.com/live/dQw4w9WgXcQ",
			provider: "youtube",
			id:       "dQw4w9WgXcQ",
			embed:    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
		},
		{
			name:     "youtube embed url",
			raw:      "https://www.youtube.com/embed/dQw4w9WgXcQ",
			provider: "youtube",
			id:       "dQw4w9WgXcQ",
			embed:    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
		},
		{
			name:     "m.youtube.com host",
			raw:      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
			provider: "youtube",
			id:       "dQw4w9WgXcQ",
			embed:    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
		},
		{
			name:     "vimeo",
			raw:      "https://vimeo.com/123456789",
			provider: "vimeo",
			id:       "123456789",
			embed:    "https://player.vimeo.com/video/123456789",
		},
		{
			name:     "vimeo player url",
			raw:      "https://player.vimeo.com/video/123456789",
			provider: "vimeo",
			id:       "123456789",
			embed:    "https://player.vimeo.com/video/123456789",
		},
		{
			name:     "dailymotion",
			raw:      "https://www.dailymotion.com/video/x8abcde",
			provider: "dailymotion",
			id:       "x8abcde",
			embed:    "https://www.dailymotion.com/embed/video/x8abcde",
		},
		{
			name:     "dai.ly short link",
			raw:      "https://dai.ly/x8abcde",
			provider: "dailymotion",
			id:       "x8abcde",
			embed:    "https://www.dailymotion.com/embed/video/x8abcde",
		},
		{
			name:     "tiktok video",
			raw:      "https://www.tiktok.com/@someuser/video/7212345678901234567",
			provider: "tiktok",
			id:       "7212345678901234567",
			embed:    "https://www.tiktok.com/embed/v2/7212345678901234567",
		},
		{
			name:     "instagram reel",
			raw:      "https://www.instagram.com/reel/CxYz-12AbCd/",
			provider: "instagram",
			id:       "CxYz-12AbCd",
			embed:    "https://www.instagram.com/reel/CxYz-12AbCd/embed",
		},
		{
			name:     "instagram post",
			raw:      "https://instagram.com/p/CxYz-12AbCd/?igsh=xyz",
			provider: "instagram",
			id:       "CxYz-12AbCd",
			embed:    "https://www.instagram.com/p/CxYz-12AbCd/embed",
		},
		{
			name:     "instagram tv",
			raw:      "https://www.instagram.com/tv/CxYz-12AbCd/",
			provider: "instagram",
			id:       "CxYz-12AbCd",
			embed:    "https://www.instagram.com/tv/CxYz-12AbCd/embed",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.raw)
			if err != nil {
				t.Fatalf("Parse(%q) returned error: %v", tc.raw, err)
			}
			if got.Provider != tc.provider {
				t.Errorf("provider = %q, want %q", got.Provider, tc.provider)
			}
			if got.VideoID != tc.id {
				t.Errorf("video id = %q, want %q", got.VideoID, tc.id)
			}
			if got.EmbedURL != tc.embed {
				t.Errorf("embed url = %q, want %q", got.EmbedURL, tc.embed)
			}
			if got.URL != tc.raw {
				t.Errorf("url = %q, want the original %q", got.URL, tc.raw)
			}
		})
	}
}

func TestParseFacebookLinks(t *testing.T) {
	cases := []struct {
		name  string
		raw   string
		id    string
		embed string
	}{
		{
			name:  "page video url",
			raw:   "https://www.facebook.com/somepage/videos/1234567890",
			id:    "1234567890",
			embed: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fsomepage%2Fvideos%2F1234567890&show_text=false",
		},
		{
			name:  "reel url",
			raw:   "https://www.facebook.com/reel/1234567890",
			id:    "1234567890",
			embed: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1234567890&show_text=false",
		},
		{
			name:  "watch url",
			raw:   "https://www.facebook.com/watch/?v=1234567890",
			id:    "1234567890",
			embed: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2Fwatch%2F%3Fv%3D1234567890&show_text=false",
		},
		{
			name:  "fb.watch short link",
			raw:   "https://fb.watch/aBcD1234_/",
			id:    "aBcD1234_",
			embed: "https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Ffb.watch%2FaBcD1234_%2F&show_text=false",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.raw)
			if err != nil {
				t.Fatalf("Parse(%q) returned error: %v", tc.raw, err)
			}
			if got.Provider != "facebook" {
				t.Errorf("provider = %q, want %q", got.Provider, "facebook")
			}
			if got.VideoID != tc.id {
				t.Errorf("video id = %q, want %q", got.VideoID, tc.id)
			}
			if got.EmbedURL != tc.embed {
				t.Errorf("embed url = %q, want %q", got.EmbedURL, tc.embed)
			}
		})
	}
}

func TestParseRejectsUnsupportedLinks(t *testing.T) {
	cases := []struct {
		name string
		raw  string
	}{
		{"empty string", ""},
		{"whitespace only", "   "},
		{"unknown host", "https://evil.example.com/video/123"},
		{"javascript scheme", "javascript:alert(1)"},
		{"data scheme", "data:text/html,<script>alert(1)</script>"},
		{"plain http is not upgraded silently", "http://www.youtube.com/watch?v=dQw4w9WgXcQ"},
		{"youtube host without a video id", "https://www.youtube.com/watch?list=PL123"},
		{"youtube channel page", "https://www.youtube.com/@somechannel"},
		{"lookalike host suffix", "https://notyoutube.com/watch?v=dQw4w9WgXcQ"},
		{"lookalike host prefix", "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ"},
		{"vimeo non numeric id", "https://vimeo.com/channels/staffpicks"},
		{"tiktok profile page", "https://www.tiktok.com/@someuser"},
		{"instagram profile page", "https://www.instagram.com/someuser/"},
		{"facebook profile page", "https://www.facebook.com/somepage"},
		{"not a url at all", "just some text"},
		{"path traversal in id", "https://www.youtube.com/embed/../../admin"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Parse(tc.raw)
			if err == nil {
				t.Fatalf("Parse(%q) succeeded with %+v, want an error", tc.raw, got)
			}
		})
	}
}

func TestParseTrimsSurroundingWhitespace(t *testing.T) {
	got, err := Parse("  https://youtu.be/dQw4w9WgXcQ  ")
	if err != nil {
		t.Fatalf("Parse returned error: %v", err)
	}
	if got.URL != "https://youtu.be/dQw4w9WgXcQ" {
		t.Errorf("url = %q, want the trimmed original", got.URL)
	}
}

func TestParseOrNil(t *testing.T) {
	if got := ParseOrNil(""); got != nil {
		t.Errorf("ParseOrNil(\"\") = %+v, want nil", got)
	}
	// A URL stored before its platform left the allowlist must degrade to "no
	// video", never break the response it is part of.
	if got := ParseOrNil("https://evil.example.com/video/123"); got != nil {
		t.Errorf("ParseOrNil(unsupported) = %+v, want nil", got)
	}
	got := ParseOrNil("https://youtu.be/dQw4w9WgXcQ")
	if got == nil {
		t.Fatal("ParseOrNil(valid) = nil, want a video")
	}
	if got.EmbedURL != "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" {
		t.Errorf("embed url = %q", got.EmbedURL)
	}
}
