package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
)

var validFieldTypes = map[string]bool{"text": true, "url": true, "select": true, "number": true}

type reviewFieldBody struct {
	Scope      string   `json:"scope"`
	ScopeRef   string   `json:"scope_ref"`
	FieldKey   string   `json:"field_key"`
	Label      string   `json:"label"`
	Type       string   `json:"type"`
	IsRequired bool     `json:"is_required"`
	Options    []string `json:"options"`
	MinValue   *float64 `json:"min_value"`
	MaxValue   *float64 `json:"max_value"`
	HelpText   string   `json:"help_text"`
	SortOrder  int      `json:"sort_order"`
}

// invalidateFor clears the cache entries a write to this scope affects.
// Every admin write path must call it — a missed call leaves stale config with
// no TTL to heal it.
func (h *AdminHandler) invalidateFor(r *http.Request, scope, ref string) {
	if scope == "product" {
		if id, err := strconv.ParseInt(ref, 10, 64); err == nil {
			h.fieldCache.InvalidateProduct(r.Context(), id)
		}
		return
	}
	h.fieldCache.InvalidateCategory(r.Context(), ref)
}

func (h *AdminHandler) ListReviewFields(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	ref := r.URL.Query().Get("scope_ref")
	if scope != "category" && scope != "product" {
		writeError(w, http.StatusBadRequest, "scope must be category or product")
		return
	}
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, field_key, label, type, is_required, COALESCE(options,'[]'),
		       min_value, max_value, help_text, sort_order, is_active
		FROM review_fields WHERE scope = ? AND scope_ref = ?
		ORDER BY sort_order, id`, scope, ref)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	type row struct {
		ID         int64    `json:"id"`
		FieldKey   string   `json:"field_key"`
		Label      string   `json:"label"`
		Type       string   `json:"type"`
		IsRequired bool     `json:"is_required"`
		Options    []string `json:"options"`
		MinValue   *float64 `json:"min_value"`
		MaxValue   *float64 `json:"max_value"`
		HelpText   string   `json:"help_text"`
		SortOrder  int      `json:"sort_order"`
		IsActive   bool     `json:"is_active"`
	}
	out := []row{}
	for rows.Next() {
		var v row
		var req, active int
		var opts string
		if err := rows.Scan(&v.ID, &v.FieldKey, &v.Label, &v.Type, &req, &opts,
			&v.MinValue, &v.MaxValue, &v.HelpText, &v.SortOrder, &active); err != nil {
			continue
		}
		v.IsRequired, v.IsActive = req == 1, active == 1
		if json.Unmarshal([]byte(opts), &v.Options) != nil || v.Options == nil {
			v.Options = []string{}
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, out)
}

func validateFieldBody(b *reviewFieldBody) string {
	b.FieldKey = strings.TrimSpace(b.FieldKey)
	b.Label = strings.TrimSpace(b.Label)
	if b.Scope != "category" && b.Scope != "product" {
		return "scope must be category or product"
	}
	if b.ScopeRef == "" {
		return "scope_ref is required"
	}
	if b.FieldKey == "" || b.Label == "" {
		return "field_key and label are required"
	}
	if !validFieldTypes[b.Type] {
		return "type must be text, url, select or number"
	}
	if b.Type == "select" && len(b.Options) == 0 {
		return "a select field needs at least one option"
	}
	if b.MinValue != nil && b.MaxValue != nil && *b.MinValue > *b.MaxValue {
		return "min_value cannot exceed max_value"
	}
	return ""
}

func (h *AdminHandler) CreateReviewField(w http.ResponseWriter, r *http.Request) {
	var b reviewFieldBody
	if json.NewDecoder(r.Body).Decode(&b) != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if msg := validateFieldBody(&b); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	opts, _ := json.Marshal(b.Options)
	res, err := h.db.ExecContext(r.Context(), `
		INSERT INTO review_fields
		  (scope, scope_ref, field_key, label, type, is_required, options, min_value, max_value, help_text, sort_order)
		VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		b.Scope, b.ScopeRef, b.FieldKey, b.Label, b.Type, b.IsRequired,
		string(opts), b.MinValue, b.MaxValue, b.HelpText, b.SortOrder)
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not create field: "+err.Error())
		return
	}
	h.invalidateFor(r, b.Scope, b.ScopeRef)
	id, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

// scopeOfField reads a field's scope so a write can invalidate the right keys
// without the client having to restate them.
func (h *AdminHandler) scopeOfField(r *http.Request, id int64) (string, string, bool) {
	var scope, ref string
	err := h.db.QueryRowContext(r.Context(),
		`SELECT scope, scope_ref FROM review_fields WHERE id = ?`, id).Scan(&scope, &ref)
	return scope, ref, err == nil
}

func (h *AdminHandler) UpdateReviewField(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	scope, ref, ok := h.scopeOfField(r, id)
	if !ok {
		writeError(w, http.StatusNotFound, "field not found")
		return
	}
	var b reviewFieldBody
	if json.NewDecoder(r.Body).Decode(&b) != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	b.Scope, b.ScopeRef = scope, ref // scope is immutable once created
	if msg := validateFieldBody(&b); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	opts, _ := json.Marshal(b.Options)
	if _, err := h.db.ExecContext(r.Context(), `
		UPDATE review_fields SET label=?, type=?, is_required=?, options=?,
		       min_value=?, max_value=?, help_text=?, sort_order=?
		WHERE id = ?`,
		b.Label, b.Type, b.IsRequired, string(opts),
		b.MinValue, b.MaxValue, b.HelpText, b.SortOrder, id); err != nil {
		writeError(w, http.StatusInternalServerError, "update failed")
		return
	}
	h.invalidateFor(r, scope, ref)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// DeleteReviewField deactivates rather than deletes. review_field_values
// cascades on field_id, so a hard delete would destroy the answers on every
// historical review that used this field.
func (h *AdminHandler) DeleteReviewField(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	scope, ref, ok := h.scopeOfField(r, id)
	if !ok {
		writeError(w, http.StatusNotFound, "field not found")
		return
	}
	if _, err := h.db.ExecContext(r.Context(),
		`UPDATE review_fields SET is_active = 0 WHERE id = ?`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	h.invalidateFor(r, scope, ref)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) SetFieldHide(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid product id")
		return
	}
	var b struct {
		FieldID int64 `json:"field_id"`
		Hidden  bool  `json:"hidden"`
	}
	if json.NewDecoder(r.Body).Decode(&b) != nil || b.FieldID == 0 {
		writeError(w, http.StatusBadRequest, "field_id is required")
		return
	}
	if b.Hidden {
		_, err = h.db.ExecContext(r.Context(),
			`INSERT IGNORE INTO product_field_hides (product_id, field_id) VALUES (?, ?)`, productID, b.FieldID)
	} else {
		_, err = h.db.ExecContext(r.Context(),
			`DELETE FROM product_field_hides WHERE product_id = ? AND field_id = ?`, productID, b.FieldID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update hide")
		return
	}
	h.fieldCache.InvalidateProduct(r.Context(), productID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
