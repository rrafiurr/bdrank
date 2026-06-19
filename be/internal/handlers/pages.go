package handlers

import (
	"net/http"

	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type PageHandler struct {
	pages *repository.PageRepo
}

func NewPageHandler(pages *repository.PageRepo) *PageHandler {
	return &PageHandler{pages: pages}
}

func (h *PageHandler) List(w http.ResponseWriter, r *http.Request) {
	pages, err := h.pages.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch pages")
		return
	}
	writeJSON(w, http.StatusOK, pages)
}

func (h *PageHandler) Get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	page, err := h.pages.FindBySlug(r.Context(), slug)
	if err == repository.ErrNotFound {
		writeError(w, http.StatusNotFound, "page not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch page")
		return
	}
	writeJSON(w, http.StatusOK, page)
}
