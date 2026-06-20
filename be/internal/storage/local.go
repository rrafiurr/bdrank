package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// LocalStorage saves images to a local directory and serves them via BASE_URL.
// Replace with an S3Storage or R2Storage implementation to switch hosting.
type LocalStorage struct {
	uploadDir string
	baseURL   string
}

func NewLocal(uploadDir, baseURL string) *LocalStorage {
	return &LocalStorage{uploadDir: uploadDir, baseURL: baseURL}
}

// Store reads from r, validates it is an image, writes it to disk with a
// random filename, and returns a relative path (e.g. "uploads/abc.jpg").
func (s *LocalStorage) Store(_ context.Context, r io.Reader, originalFilename string, maxBytes int64) (string, error) {
	// Sniff the first 512 bytes for content-type detection.
	peek := make([]byte, 512)
	n, err := io.ReadFull(r, peek)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return "", fmt.Errorf("could not read file: %w", err)
	}

	ct := http.DetectContentType(peek[:n])
	if !strings.HasPrefix(ct, "image/") {
		return "", errors.New("only image files are accepted")
	}

	ext := filepath.Ext(originalFilename)
	if ext == "" || ext == "." {
		ext = mimeExt(ct)
	}

	b := make([]byte, 12)
	rand.Read(b)
	filename := hex.EncodeToString(b) + ext
	fullPath := filepath.Join(s.uploadDir, filename)

	dst, err := os.Create(fullPath)
	if err != nil {
		return "", fmt.Errorf("could not create upload file: %w", err)
	}
	defer dst.Close()

	// Write the already-read peek bytes, then the rest capped at maxBytes.
	dst.Write(peek[:n])
	remaining := io.LimitReader(r, maxBytes-int64(n)+1)
	written, err := io.Copy(dst, remaining)
	if err != nil {
		os.Remove(fullPath)
		return "", fmt.Errorf("failed to write file: %w", err)
	}
	if int64(n)+written > maxBytes {
		os.Remove(fullPath)
		return "", fmt.Errorf("file exceeds %d MB limit", maxBytes>>20)
	}

	return "uploads/" + filename, nil
}

// URL converts a stored relative path to its full public URL.
// Absolute URLs (legacy rows or external links) are passed through unchanged.
func (s *LocalStorage) URL(path string) string {
	if path == "" || strings.HasPrefix(path, "http") {
		return path
	}
	return strings.TrimRight(s.baseURL, "/") + "/" + strings.TrimLeft(path, "/")
}

func mimeExt(ct string) string {
	switch ct {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".jpg"
	}
}
