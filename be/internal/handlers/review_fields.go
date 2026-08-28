package handlers

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

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

// ValidateFieldAnswers checks submitted answers against the server-resolved
// field list and returns them keyed by field id.
//
// The submitted key set is never trusted: the client can omit, add, or alter
// keys. Unknown keys are dropped rather than rejected, so a form opened before
// an admin edit still submits successfully.
func ValidateFieldAnswers(fields []models.ReviewField, submitted map[string]string) (map[int64]string, string) {
	out := map[int64]string{}
	for _, f := range fields {
		raw := strings.TrimSpace(submitted[strconv.FormatInt(f.ID, 10)])

		if raw == "" {
			if f.IsRequired {
				return nil, f.Label + " is required"
			}
			continue
		}

		switch f.Type {
		case "url":
			u, err := url.Parse(raw)
			if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
				return nil, f.Label + " must be a valid http or https link"
			}
		case "number":
			n, err := strconv.ParseFloat(raw, 64)
			if err != nil {
				return nil, f.Label + " must be a number"
			}
			if f.MinValue != nil && n < *f.MinValue {
				return nil, f.Label + " is below the allowed minimum"
			}
			if f.MaxValue != nil && n > *f.MaxValue {
				return nil, f.Label + " is above the allowed maximum"
			}
		case "select":
			ok := false
			for _, o := range f.Options {
				if o == raw {
					ok = true
					break
				}
			}
			if !ok {
				return nil, raw + " is not an option for " + f.Label
			}
		case "text":
			if len([]rune(raw)) > 1000 {
				return nil, f.Label + " is too long (max 1000 characters)"
			}
		}
		out[f.ID] = raw
	}
	return out, ""
}
