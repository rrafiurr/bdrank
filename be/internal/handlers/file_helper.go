package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// saveOpenFile persists an already-opened multipart file to disk and returns its relative path (e.g. "uploads/abc.jpg").
func saveOpenFile(file multipart.File, header *multipart.FileHeader, uploadDir string, maxBytes int64) (string, error) {
	if header.Size > maxBytes {
		return "", io.ErrUnexpectedEOF
	}

	buf := make([]byte, 512)
	n, _ := file.Read(buf)
	ct := http.DetectContentType(buf[:n])
	if !strings.HasPrefix(ct, "image/") {
		return "", io.ErrUnexpectedEOF
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
		return "", err
	}
	defer dst.Close()

	dst.Write(buf[:n])
	io.Copy(dst, file)

	return "uploads/" + filename, nil
}
