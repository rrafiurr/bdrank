package handlers

import (
	"net/http"
	"strconv"

	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type ProductHandler struct {
	products *repository.ProductRepo
	reviews  *repository.ReviewRepo
}

func NewProductHandler(products *repository.ProductRepo, reviews *repository.ReviewRepo) *ProductHandler {
	return &ProductHandler{products: products, reviews: reviews}
}

func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
	f := repository.ProductFilter{
		Category: r.URL.Query().Get("category"),
		Query:    r.URL.Query().Get("q"),
		Sort:     r.URL.Query().Get("sort"),
		Limit:    queryInt(r, "limit", 12),
		Offset:   queryInt(r, "offset", 0),
	}
	products, total, err := h.products.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": products, "total": total})
}

func (h *ProductHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	product, err := h.products.FindByID(r.Context(), id)
	if err == repository.ErrNotFound {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch product")
		return
	}
	writeJSON(w, http.StatusOK, product)
}

func (h *ProductHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := h.products.ListCategories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch categories")
		return
	}
	writeJSON(w, http.StatusOK, cats)
}

func (h *ProductHandler) CategoryStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.products.CategoryStats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (h *ProductHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	f := repository.ReviewFilter{
		ProductID: id,
		Sort:      r.URL.Query().Get("sort"),
		Limit:     queryInt(r, "limit", 20),
		Offset:    queryInt(r, "offset", 0),
	}
	reviews, total, err := h.reviews.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": reviews, "total": total})
}
