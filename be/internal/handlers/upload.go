package handlers

import (
	"net/http"

	"final-review/be/internal/storage"
)

type UploadHandler struct {
	storage storage.Storage
}

func NewUploadHandler(s storage.Storage) *UploadHandler {
	return &UploadHandler{storage: s}
}

func (h *UploadHandler) Image(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "request too large or not multipart")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "field 'file' missing")
		return
	}
	defer file.Close()

	path, err := h.storage.Store(r.Context(), file, header.Filename, 10<<20)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": h.storage.URL(path)})
}
