package storage

import (
	"context"
	"io"
)

// Storage is the single interface for persisting uploaded images.
// To switch hosting (local disk → S3 → Cloudflare R2 → etc.) implement
// this interface and swap the constructor in router.go — nothing else changes.
type Storage interface {
	// Store validates and saves image data from r, returning a relative path
	// suitable for storing in the database (e.g. "uploads/abc.jpg").
	Store(ctx context.Context, r io.Reader, originalFilename string, maxBytes int64) (string, error)

	// URL converts a stored path to a full public URL.
	// If path already starts with "http" (external/legacy URL) it is returned unchanged.
	URL(path string) string

	// Delete removes a previously stored file. Implementations must no-op
	// (return nil) for empty paths and external/absolute "http" URLs, which are
	// not stored locally. A missing file must not be treated as an error.
	Delete(ctx context.Context, path string) error
}
