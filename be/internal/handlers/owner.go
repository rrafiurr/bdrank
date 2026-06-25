package handlers

import (
	"log"
	"net/http"
	"strconv"

	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
)

type OwnerHandler struct {
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	users    *repository.UserRepo
}

func NewOwnerHandler(reviews *repository.ReviewRepo, products *repository.ProductRepo, users *repository.UserRepo) *OwnerHandler {
	return &OwnerHandler{reviews: reviews, products: products, users: users}
}

func (h *OwnerHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	if !h.users.IsVerifiedOwner(r.Context(), userID) {
		writeError(w, http.StatusForbidden, "account pending verification")
		return
	}

	var productID int64
	if s := r.URL.Query().Get("product_id"); s != "" {
		pid, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid product_id")
			return
		}
		if !h.products.OwnedBy(r.Context(), pid, userID) {
			writeError(w, http.StatusForbidden, "product not found")
			return
		}
		productID = pid
	}

	limit := queryInt(r, "limit", 20)
	offset := queryInt(r, "offset", 0)

	reviews, total, err := h.reviews.ListByOwner(r.Context(), userID, productID, limit, offset)
	if err != nil {
		log.Printf("ERROR owner ListReviews userID=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": reviews, "total": total})
}
