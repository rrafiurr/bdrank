package handlers

import "testing"

func TestParseOptionalVideo(t *testing.T) {
	t.Run("empty means no video, not an error", func(t *testing.T) {
		got, ok := parseOptionalVideo("")
		if !ok {
			t.Fatal("ok = false, want true: an absent video link is valid")
		}
		if got != "" {
			t.Errorf("stored url = %q, want empty", got)
		}
	})

	t.Run("whitespace only means no video", func(t *testing.T) {
		got, ok := parseOptionalVideo("   ")
		if !ok || got != "" {
			t.Fatalf("got (%q, %v), want (\"\", true)", got, ok)
		}
	})

	t.Run("supported link is stored trimmed and as submitted", func(t *testing.T) {
		got, ok := parseOptionalVideo("  https://youtu.be/dQw4w9WgXcQ ")
		if !ok {
			t.Fatal("ok = false, want true")
		}
		// The original link is what gets stored — the embed URL is derived on read.
		if got != "https://youtu.be/dQw4w9WgXcQ" {
			t.Errorf("stored url = %q, want the trimmed original", got)
		}
	})

	t.Run("unsupported link is rejected", func(t *testing.T) {
		if got, ok := parseOptionalVideo("https://evil.example.com/v/1"); ok {
			t.Fatalf("ok = true (got %q), want rejection", got)
		}
	})
}
