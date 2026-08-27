package storage

import (
	"context"
	"io"
	"time"
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

	// List returns every stored file, newest first. Used by the CMS image
	// manager to show what is on disk regardless of what references it.
	List(ctx context.Context) ([]FileInfo, error)
}

// FileInfo describes one stored file. Path is the same relative form Store
// returns ("uploads/abc.jpg"), so it can be passed straight back to Delete.
type FileInfo struct {
	Path     string    `json:"-"`
	Filename string    `json:"filename"`
	URL      string    `json:"url"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}
