package handlers

import (
	"net/http"
	"strconv"

	"final-review/be/internal/models"
	"final-review/be/internal/repository"
)

type ReviewFieldHandler struct {
	cache *repository.ReviewFieldCache
}

func NewReviewFieldHandler(cache *repository.ReviewFieldCache) *ReviewFieldHandler {
	return &ReviewFieldHandler{cache: cache}
}

// List serves the resolved field list for a product or a category.
// product_id wins when both are supplied.
func (h *ReviewFieldHandler) List(w http.ResponseWriter, r *http.Request) {
	category := r.URL.Query().Get("category")
	var productID int64
	if s := r.URL.Query().Get("product_id"); s != "" {
		id, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid product_id")
			return
		}
		productID = id
	}

	if category == "" && productID == 0 {
		// An empty list, not an error: the form calls this before the reviewer
		// has chosen anything.
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	fields, err := h.cache.Resolve(r.Context(), category, productID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load form fields")
		return
	}
	if fields == nil {
		fields = []models.ReviewField{}
	}
	writeJSON(w, http.StatusOK, fields)
}
