package handlers

import (
	"strings"

	"final-review/be/internal/video"
)

// videoRejected is the message returned when a submitted link is not a
// recognizable video on a supported platform.
const videoRejected = "video link must be a YouTube, Facebook, Instagram, TikTok, Vimeo, or Dailymotion video URL"

// parseOptionalVideo validates a submitted video link and returns the URL to
// store. An absent link is valid and stores "". ok is false only when the user
// supplied something that is not a supported video.
func parseOptionalVideo(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", true
	}
	v, err := video.Parse(raw)
	if err != nil {
		return "", false
	}
	// Store the original link, not the embed URL: the embed mapping is derived
	// on read so it can change without a data migration.
	return v.URL, true
}
