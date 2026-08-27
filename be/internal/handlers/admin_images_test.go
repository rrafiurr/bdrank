package handlers

import "testing"

func TestSafeUploadFilename(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
		ok   bool
	}{
		{"plain", "abc123.jpg", "abc123.jpg", true},
		{"strips directory", "sub/dir/abc.png", "abc.png", true},
		{"traversal", "../../etc/passwd", "passwd", true},
		{"percent-encoded traversal", "%2e%2e%2f%2e%2e%2fbe%2f.env", "", false},
		{"encoded slash then name", "%2e%2e%2fuploads%2fa.jpg", "a.jpg", true},
		{"dotfile", ".env", "", false},
		{"encoded dotfile", "%2eenv", "", false},
		{"dot", ".", "", false},
		{"dotdot", "..", "", false},
		{"empty", "", "", false},
		{"whitespace", "   ", "", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := safeUploadFilename(c.in)
			if ok != c.ok || got != c.want {
				t.Errorf("safeUploadFilename(%q) = (%q, %v), want (%q, %v)", c.in, got, ok, c.want, c.ok)
			}
		})
	}
}
