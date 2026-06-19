package handlers

import (
	"net/http"
	"strconv"

	"final-review/be/internal/config"
	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type ReviewHandler struct {
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	cfg      *config.Config
}

func NewReviewHandler(reviews *repository.ReviewRepo, products *repository.ProductRepo, cfg *config.Config) *ReviewHandler {
	return &ReviewHandler{reviews: reviews, products: products, cfg: cfg}
}

func (h *ReviewHandler) List(w http.ResponseWriter, r *http.Request) {
	minRating, _ := strconv.Atoi(r.URL.Query().Get("min_rating"))
	f := repository.ReviewFilter{
		Category:     r.URL.Query().Get("category"),
		Query:        r.URL.Query().Get("q"),
		MinRating:    minRating,
		Sort:         r.URL.Query().Get("sort"),
		Limit:        queryInt(r, "limit", 20),
		Offset:       queryInt(r, "offset", 0),
		TimelineOnly: queryBool(r, "timeline_only"),
	}
	reviews, total, err := h.reviews.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": reviews, "total": total})
}

func (h *ReviewHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	review, err := h.reviews.FindByID(r.Context(), id)
	if err == repository.ErrNotFound {
		writeError(w, http.StatusNotFound, "review not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch review")
		return
	}
	writeJSON(w, http.StatusOK, review)
}

func (h *ReviewHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	if err := r.ParseMultipartForm(32 << 20); err != nil {
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

	var productID int64
	if pidStr := r.FormValue("product_id"); pidStr != "" {
		pid, err := strconv.ParseInt(pidStr, 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid product_id")
			return
		}
		if !h.products.Exists(r.Context(), pid) {
			writeError(w, http.StatusNotFound, "product not found")
			return
		}
		productID = pid
	} else {
		productName := r.FormValue("product_name")
		category := r.FormValue("category")
		if productName == "" || category == "" {
			writeError(w, http.StatusBadRequest, "product_name and category are required when product_id is not provided")
			return
		}
		product, err := h.products.FindOrCreate(r.Context(), productName, category)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to find or create product")
			return
		}
		productID = product.ID
	}

	reviewID, err := h.reviews.Create(r.Context(), userID, productID, title, content, rating)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create review")
		return
	}

	// up to 3 image files
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		files := r.MultipartForm.File["images[]"]
		if len(files) > 3 {
			files = files[:3]
		}
		for _, fh := range files {
			f, err := fh.Open()
			if err != nil {
				continue
			}
			url, err := saveOpenFile(f, fh, h.cfg.UploadDir, 5<<20)
			f.Close()
			if err != nil {
				continue
			}
			h.reviews.AddImage(r.Context(), reviewID, url)
		}
	}

	review, err := h.reviews.FindByID(r.Context(), reviewID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch created review")
		return
	}
	writeJSON(w, http.StatusCreated, review)
}

func (h *ReviewHandler) Like(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	if !h.reviews.Exists(r.Context(), id) {
		writeError(w, http.StatusNotFound, "review not found")
		return
	}

	liked, count, err := h.reviews.ToggleLike(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to toggle like")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"liked": liked, "likes_count": count})
}

func (h *ReviewHandler) View(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	h.reviews.IncrementViews(r.Context(), id)
	w.WriteHeader(http.StatusNoContent)
}
