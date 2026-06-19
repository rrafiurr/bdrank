package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"final-review/be/internal/config"
)

type UploadHandler struct {
	cfg *config.Config
}

func NewUploadHandler(cfg *config.Config) *UploadHandler {
	return &UploadHandler{cfg: cfg}
}

func (h *UploadHandler) Image(w http.ResponseWriter, r *http.Request) {
	path, err := saveFormFile(r, "file", h.cfg.UploadDir, 10<<20)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	fullURL := strings.TrimRight(h.cfg.BaseURL, "/") + "/" + path
	writeJSON(w, http.StatusOK, map[string]string{"url": fullURL})
}

// saveFormFile reads a file field from a multipart form, validates it as an image,
// persists it to disk, and returns its relative path (e.g. "uploads/abc.jpg").
func saveFormFile(r *http.Request, field, uploadDir string, maxBytes int64) (string, error) {
	if err := r.ParseMultipartForm(maxBytes); err != nil {
		return "", fmt.Errorf("request too large or not multipart")
	}

	file, header, err := r.FormFile(field)
	if err != nil {
		return "", fmt.Errorf("field '%s' missing", field)
	}
	defer file.Close()

	if header.Size > maxBytes {
		return "", fmt.Errorf("file exceeds size limit")
	}

	// Detect content type from the first 512 bytes.
	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	ct := http.DetectContentType(buf[:n])
	if !strings.HasPrefix(ct, "image/") {
		return "", fmt.Errorf("only image files are accepted")
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" || ext == "." {
		ext = mimeExt(ct)
	}

	b := make([]byte, 12)
	rand.Read(b)
	filename := hex.EncodeToString(b) + ext

	dst, err := os.Create(filepath.Join(uploadDir, filename))
	if err != nil {
		return "", fmt.Errorf("could not save file")
	}
	defer dst.Close()

	dst.Write(buf[:n])
	io.Copy(dst, file)

	return "uploads/" + filename, nil
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
