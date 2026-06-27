package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
)

type OwnerHandler struct {
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	users    *repository.UserRepo
	embeds   *repository.EmbedRepo
}

func NewOwnerHandler(
	reviews *repository.ReviewRepo,
	products *repository.ProductRepo,
	users *repository.UserRepo,
	embeds *repository.EmbedRepo,
) *OwnerHandler {
	return &OwnerHandler{reviews: reviews, products: products, users: users, embeds: embeds}
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

// RequestEmbed handles POST /owner/embed — verified owner submits an embed request.
func (h *OwnerHandler) RequestEmbed(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if !h.users.IsVerifiedOwner(r.Context(), userID) {
		writeError(w, http.StatusForbidden, "account pending verification")
		return
	}

	var body struct {
		ProductID     int64  `json:"product_id"`
		Domain        string `json:"domain"`
		ShowRating    bool   `json:"show_rating"`
		ShowCount     bool   `json:"show_count"`
		ShowBreakdown bool   `json:"show_breakdown"`
		ShowSnippet   bool   `json:"show_snippet"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.ProductID == 0 || body.Domain == "" {
		writeError(w, http.StatusBadRequest, "product_id and domain are required")
		return
	}
	if !h.products.OwnedBy(r.Context(), body.ProductID, userID) {
		writeError(w, http.StatusForbidden, "product not found")
		return
	}

	domain := sanitizeDomain(body.Domain)
	if domain == "" {
		writeError(w, http.StatusBadRequest, "invalid domain")
		return
	}

	tok, err := h.embeds.Create(r.Context(), repository.CreateEmbedReq{
		ProductID:     body.ProductID,
		OwnerID:       userID,
		Domain:        domain,
		ShowRating:    body.ShowRating,
		ShowCount:     body.ShowCount,
		ShowBreakdown: body.ShowBreakdown,
		ShowSnippet:   body.ShowSnippet,
	})
	if err != nil {
		log.Printf("ERROR owner RequestEmbed userID=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to create embed request")
		return
	}
	writeJSON(w, http.StatusCreated, tok)
}

// ListEmbeds handles GET /owner/embed — returns all embed tokens for the owner.
func (h *OwnerHandler) ListEmbeds(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if !h.users.IsVerifiedOwner(r.Context(), userID) {
		writeError(w, http.StatusForbidden, "account pending verification")
		return
	}
	tokens, err := h.embeds.ListByOwner(r.Context(), userID)
	if err != nil {
		log.Printf("ERROR owner ListEmbeds userID=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to fetch embeds")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": tokens})
}

// sanitizeDomain strips scheme, path, and port from a user-supplied domain string,
// returning a bare lowercase hostname (e.g. "mybrand.com"). Returns "" if invalid.
func sanitizeDomain(raw string) string {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return ""
	}
	return strings.ToLower(u.Hostname())
}
