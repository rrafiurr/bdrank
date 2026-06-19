package handlers

import (
	"net/http"
	"strconv"

	"final-review/be/internal/config"
	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type TimelineHandler struct {
	reviews *repository.ReviewRepo
	cfg     *config.Config
}

func NewTimelineHandler(reviews *repository.ReviewRepo, cfg *config.Config) *TimelineHandler {
	return &TimelineHandler{reviews: reviews, cfg: cfg}
}

func (h *TimelineHandler) Create(w http.ResponseWriter, r *http.Request) {
	reviewID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid review id")
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	if !h.reviews.IsAuthor(r.Context(), reviewID, userID) {
		writeError(w, http.StatusForbidden, "only the review author can add timeline entries")
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	title := r.FormValue("title")
	content := r.FormValue("content")
	ratingStr := r.FormValue("rating")

	if title == "" || content == "" || ratingStr == "" {
		writeError(w, http.StatusBadRequest, "title, content, and rating are required")
		return
	}

	rating, err := strconv.Atoi(ratingStr)
	if err != nil || rating < 1 || rating > 5 {
		writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}

	var imageURL string
	file, fh, fileErr := r.FormFile("image")
	if fileErr == nil {
		defer file.Close()
		imageURL, _ = saveOpenFile(file, fh, h.cfg.UploadDir, 10<<20)
	}

	entry, err := h.reviews.AddTimelineEntry(r.Context(), reviewID, title, content, rating, imageURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add timeline entry")
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}
