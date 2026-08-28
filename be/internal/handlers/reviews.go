package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"final-review/be/internal/middleware"
	"final-review/be/internal/models"
	"final-review/be/internal/repository"
	"final-review/be/internal/rewards"
	"final-review/be/internal/storage"
	"github.com/go-chi/chi/v5"
)

type ReviewHandler struct {
	reviews   *repository.ReviewRepo
	products  *repository.ProductRepo
	storage   storage.Storage
	rewards   *rewards.Service
	fields    *repository.ReviewFieldCache
	fieldRepo *repository.ReviewFieldRepo
}

func NewReviewHandler(reviews *repository.ReviewRepo, products *repository.ProductRepo, s storage.Storage, rw *rewards.Service, fields *repository.ReviewFieldCache, fieldRepo *repository.ReviewFieldRepo) *ReviewHandler {
	return &ReviewHandler{reviews: reviews, products: products, storage: s, rewards: rw, fields: fields, fieldRepo: fieldRepo}
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
		log.Printf("ERROR List reviews sort=%q category=%q q=%q: %v", f.Sort, f.Category, f.Query, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	decorateReviewBadges(r, h.rewards, reviews)
	writeJSON(w, http.StatusOK, map[string]any{"data": reviews, "total": total})
}

// decorateReviewBadges is best-effort: a failure to fetch levels never fails
// the request, it just leaves AuthorBadge unset.
//
// It keys off AuthorUserID rather than Author.ID so an anonymous review still
// shows its author's level badge — hiding the identity, not the standing.
func decorateReviewBadges(r *http.Request, rw *rewards.Service, reviews []*models.Review) {
	ids := make([]int64, 0, len(reviews))
	for _, rv := range reviews {
		if rv.AuthorUserID != 0 {
			ids = append(ids, rv.AuthorUserID)
		}
	}
	badges, err := rw.LevelsForUsers(r.Context(), ids)
	if err != nil {
		log.Printf("WARN LevelsForUsers (reviews): %v", err)
		return
	}
	for _, rv := range reviews {
		if lvl, ok := badges[rv.AuthorUserID]; ok {
			rv.AuthorBadge = &models.Badge{Name: lvl.Name, Icon: lvl.Icon, Color: lvl.Color}
		}
	}
}

// decorateCommentBadges is best-effort: a failure to fetch levels never fails
// the request, it just leaves AuthorBadge unset. Like decorateReviewBadges it
// keys off AuthorUserID so masked comments keep their badge.
func decorateCommentBadges(r *http.Request, rw *rewards.Service, comments []models.Comment) {
	ids := make([]int64, 0, len(comments))
	for _, cm := range comments {
		if cm.AuthorUserID != 0 {
			ids = append(ids, cm.AuthorUserID)
		}
	}
	badges, err := rw.LevelsForUsers(r.Context(), ids)
	if err != nil {
		log.Printf("WARN LevelsForUsers (comments): %v", err)
		return
	}
	for i := range comments {
		if lvl, ok := badges[comments[i].AuthorUserID]; ok {
			comments[i].AuthorBadge = &models.Badge{Name: lvl.Name, Icon: lvl.Icon, Color: lvl.Color}
		}
	}
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
		log.Printf("ERROR FindByID reviewID=%d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch review")
		return
	}
	// Populated by middleware.OptionalAuth; 0 for a logged-out visitor. This
	// tells a viewer only about themselves, so it leaks nothing about an
	// anonymous author to anyone else.
	if viewerID := middleware.UserIDFromCtx(r.Context()); viewerID != 0 {
		review.IsMine = viewerID == review.AuthorUserID
	}
	decorateReviewBadges(r, h.rewards, []*models.Review{review})
	decorateCommentBadges(r, h.rewards, review.Comments)
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

	// Absent or "false"/"0" means a normal, attributed review — anonymity is
	// always an explicit opt-in.
	isAnonymous := r.FormValue("is_anonymous") == "true" || r.FormValue("is_anonymous") == "1"

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
			log.Printf("ERROR FindOrCreate product name=%q category=%q: %v", productName, category, err)
			writeError(w, http.StatusInternalServerError, "failed to find or create product")
			return
		}
		productID = product.ID
	}

	// Resolve server-side; the client's field list may be stale or forged.
	category := r.FormValue("category")
	resolved, err := h.fields.Resolve(r.Context(), category, productID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load form fields")
		return
	}
	var submitted map[string]string
	if raw := r.FormValue("fields"); raw != "" {
		if err := json.Unmarshal([]byte(raw), &submitted); err != nil {
			writeError(w, http.StatusBadRequest, "invalid fields payload")
			return
		}
	}
	fieldValues, msg := ValidateFieldAnswers(resolved, submitted)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	reviewID, err := h.reviews.Create(r.Context(), userID, productID, title, content, rating, isAnonymous)
	if err != nil {
		log.Printf("ERROR Create review userID=%d productID=%d: %v", userID, productID, err)
		writeError(w, http.StatusInternalServerError, "failed to create review")
		return
	}

	if err := h.fieldRepo.SaveValues(r.Context(), reviewID, fieldValues, resolved); err != nil {
		log.Printf("WARN review %d: saving custom field answers: %v", reviewID, err)
	}

	// up to 3 image files
	var imageCount int
	if r.MultipartForm != nil && r.MultipartForm.File != nil {
		files := r.MultipartForm.File["images[]"]
		log.Printf("INFO reviewID=%d image files received=%d", reviewID, len(files))
		if len(files) > 3 {
			files = files[:3]
		}
		for _, fh := range files {
			f, err := fh.Open()
			if err != nil {
				log.Printf("ERROR opening image for reviewID=%d filename=%q: %v", reviewID, fh.Filename, err)
				continue
			}
			path, err := h.storage.Store(r.Context(), f, fh.Filename, 5<<20)
			f.Close()
			if err != nil {
				log.Printf("ERROR storing image for reviewID=%d filename=%q: %v", reviewID, fh.Filename, err)
				continue
			}
			if err := h.reviews.AddImage(r.Context(), reviewID, path); err != nil {
				log.Printf("ERROR AddImage reviewID=%d path=%q: %v", reviewID, path, err)
				continue
			}
			imageCount++
		}
	} else {
		log.Printf("INFO reviewID=%d no multipart file data (MultipartForm=%v)", reviewID, r.MultipartForm != nil)
	}
	log.Printf("INFO reviewID=%d images saved=%d", reviewID, imageCount)

	if err := h.rewards.Award(r.Context(), userID, "review_created", "review", reviewID); err != nil {
		log.Printf("WARN reward review_created userID=%d reviewID=%d: %v", userID, reviewID, err)
	}
	if imageCount > 0 {
		if err := h.rewards.Award(r.Context(), userID, "review_with_image", "review", reviewID); err != nil {
			log.Printf("WARN reward review_with_image userID=%d reviewID=%d: %v", userID, reviewID, err)
		}
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":      reviewID,
		"message": "Review submitted successfully and is pending approval",
	})
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

// SetAnonymity handles PATCH /reviews/{id}/anonymity — the author toggling
// their own review between anonymous and attributed.
//
// Note that turning anonymity off is not truly reversible: anyone who has
// already seen the name, and any search engine that indexed the page, keeps
// it. The client warns about that before calling this with false.
func (h *ReviewHandler) SetAnonymity(w http.ResponseWriter, r *http.Request) {
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
	if !h.reviews.IsAuthor(r.Context(), id, userID) {
		writeError(w, http.StatusForbidden, "not your review")
		return
	}

	var body struct {
		IsAnonymous *bool `json:"is_anonymous"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IsAnonymous == nil {
		writeError(w, http.StatusBadRequest, "is_anonymous is required")
		return
	}

	if err := h.reviews.SetAnonymous(r.Context(), id, *body.IsAnonymous); err != nil {
		log.Printf("ERROR SetAnonymous reviewID=%d userID=%d: %v", id, userID, err)
		writeError(w, http.StatusInternalServerError, "failed to update review")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"is_anonymous": *body.IsAnonymous})
}
