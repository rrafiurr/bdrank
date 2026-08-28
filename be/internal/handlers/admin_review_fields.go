package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-sql-driver/mysql"
)

var validFieldTypes = map[string]bool{"text": true, "url": true, "select": true, "number": true}

// isDuplicateKeyErr reports whether err is a MySQL duplicate-entry error
// (1062), e.g. from the uq_scope_key unique index on review_fields.
func isDuplicateKeyErr(err error) bool {
	var me *mysql.MySQLError
	if errors.As(err, &me) {
		return me.Number == 1062
	}
	return false
}

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
		if isDuplicateKeyErr(err) {
			writeError(w, http.StatusConflict, "a field with this key already exists for this scope")
			return
		}
		log.Printf("ERROR CreateReviewField: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create field")
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

// updateFieldBody mirrors reviewFieldBody but with pointer fields, so a PATCH
// that omits a key leaves the corresponding column untouched (matches the
// pattern in UpdateReview). min_value/max_value are read from the raw JSON
// separately (see minMaxPresence) because a plain *float64 cannot tell
// "absent" apart from "explicitly null" — both decode to a nil pointer, but
// only the latter should clear the column.
type updateFieldBody struct {
	FieldKey   *string   `json:"field_key"`
	Label      *string   `json:"label"`
	Type       *string   `json:"type"`
	IsRequired *bool     `json:"is_required"`
	Options    *[]string `json:"options"`
	MinValue   *float64  `json:"min_value"`
	MaxValue   *float64  `json:"max_value"`
	HelpText   *string   `json:"help_text"`
	SortOrder  *int      `json:"sort_order"`
}

// minMaxPresence reports whether "min_value"/"max_value" keys were present
// in the raw JSON body at all, regardless of whether their value was a
// number or null.
func minMaxPresence(raw []byte) (minPresent, maxPresent bool) {
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil {
		return false, false
	}
	_, minPresent = m["min_value"]
	_, maxPresent = m["max_value"]
	return
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

	raw, err := io.ReadAll(r.Body)
	if err != nil || len(raw) == 0 {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	var patch updateFieldBody
	if json.Unmarshal(raw, &patch) != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	minPresent, maxPresent := minMaxPresence(raw)

	// Load the current row and overlay only what the request actually sent,
	// so an omitted field survives the write instead of being reset to its
	// zero value.
	var current reviewFieldBody
	var reqInt int
	var optsStr string
	if err := h.db.QueryRowContext(r.Context(), `
		SELECT field_key, label, type, is_required, COALESCE(options,'[]'),
		       min_value, max_value, help_text, sort_order
		FROM review_fields WHERE id = ?`, id).Scan(
		&current.FieldKey, &current.Label, &current.Type, &reqInt, &optsStr,
		&current.MinValue, &current.MaxValue, &current.HelpText, &current.SortOrder); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load field")
		return
	}
	current.IsRequired = reqInt == 1
	if json.Unmarshal([]byte(optsStr), &current.Options) != nil || current.Options == nil {
		current.Options = []string{}
	}
	current.Scope, current.ScopeRef = scope, ref // scope is immutable once created

	// field_key is likewise immutable once created (the original write path
	// never included it in the UPDATE either) — it is only read here so
	// validateFieldBody's non-empty check has something to check.
	if patch.Label != nil {
		current.Label = *patch.Label
	}
	if patch.Type != nil {
		current.Type = *patch.Type
	}
	if patch.IsRequired != nil {
		current.IsRequired = *patch.IsRequired
	}
	if patch.Options != nil {
		current.Options = *patch.Options
	}
	if minPresent {
		current.MinValue = patch.MinValue // nil here means "explicitly cleared"
	}
	if maxPresent {
		current.MaxValue = patch.MaxValue
	}
	if patch.HelpText != nil {
		current.HelpText = *patch.HelpText
	}
	if patch.SortOrder != nil {
		current.SortOrder = *patch.SortOrder
	}

	// Validate the merged result, not just the submitted fragment, so e.g.
	// patching only max_value below the stored min_value is still caught.
	if msg := validateFieldBody(&current); msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	opts, _ := json.Marshal(current.Options)
	if _, err := h.db.ExecContext(r.Context(), `
		UPDATE review_fields SET label=?, type=?, is_required=?, options=?,
		       min_value=?, max_value=?, help_text=?, sort_order=?
		WHERE id = ?`,
		current.Label, current.Type, current.IsRequired, string(opts),
		current.MinValue, current.MaxValue, current.HelpText, current.SortOrder, id); err != nil {
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

	// INSERT IGNORE below would otherwise swallow a nonexistent field_id as a
	// silent no-op (the FK violation becomes a warning, not an error), so the
	// caller would get a false "ok" for a field that was never hidden.
	var exists bool
	if err := h.db.QueryRowContext(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM review_fields WHERE id = ?)`, b.FieldID).Scan(&exists); err != nil || !exists {
		writeError(w, http.StatusNotFound, "field not found")
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
