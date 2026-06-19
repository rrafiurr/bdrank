package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type CommentHandler struct {
	comments *repository.CommentRepo
	reviews  *repository.ReviewRepo
}

func NewCommentHandler(comments *repository.CommentRepo, reviews *repository.ReviewRepo) *CommentHandler {
	return &CommentHandler{comments: comments, reviews: reviews}
}

func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	reviewID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid review id")
		return
	}
	if !h.reviews.Exists(r.Context(), reviewID) {
		writeError(w, http.StatusNotFound, "review not found")
		return
	}

	var body struct {
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	userID := middleware.UserIDFromCtx(r.Context())
	comment, err := h.comments.Create(r.Context(), reviewID, userID, body.Content)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to post comment")
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (h *CommentHandler) LikeComment(w http.ResponseWriter, r *http.Request) {
	commentID, err := strconv.ParseInt(chi.URLParam(r, "comment_id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid comment id")
		return
	}
	if !h.comments.Exists(r.Context(), commentID) {
		writeError(w, http.StatusNotFound, "comment not found")
		return
	}

	userID := middleware.UserIDFromCtx(r.Context())
	liked, count, err := h.comments.ToggleLike(r.Context(), commentID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to toggle like")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"liked": liked, "likes_count": count})
}
