package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"final-review/be/internal/models"
)

type ReviewFieldRepo struct {
	db *sql.DB
}

func NewReviewFieldRepo(db *sql.DB) *ReviewFieldRepo {
	return &ReviewFieldRepo{db: db}
}

// MergeFields applies the override rule: a product inherits its category's
// fields, may hide any of them, and may add its own. Hiding applies only to
// inherited fields — a stale hide row naming a product's own field is ignored,
// since removing one is a delete, not a hide.
//
// Ordering is sort_order then id, so two fields an admin left at the default
// sort_order still have a stable, predictable order.
func MergeFields(categoryFields, productFields []models.ReviewField, hidden map[int64]bool) []models.ReviewField {
	out := make([]models.ReviewField, 0, len(categoryFields)+len(productFields))
	for _, f := range categoryFields {
		if hidden[f.ID] {
			continue
		}
		out = append(out, f)
	}
	out = append(out, productFields...)

	sort.SliceStable(out, func(i, j int) bool {
		if out[i].SortOrder != out[j].SortOrder {
			return out[i].SortOrder < out[j].SortOrder
		}
		return out[i].ID < out[j].ID
	})
	return out
}

const fieldColumns = `id, field_key, label, type, is_required,
	COALESCE(options, '[]'), min_value, max_value, help_text, sort_order`

func scanFields(rows *sql.Rows) ([]models.ReviewField, error) {
	defer rows.Close()
	var out []models.ReviewField
	for rows.Next() {
		var f models.ReviewField
		var required int
		var optionsRaw string
		if err := rows.Scan(&f.ID, &f.FieldKey, &f.Label, &f.Type, &required,
			&optionsRaw, &f.MinValue, &f.MaxValue, &f.HelpText, &f.SortOrder); err != nil {
			return nil, err
		}
		f.IsRequired = required == 1
		// A malformed options blob must not break the whole form; an empty
		// list renders a select with no choices, which is visibly wrong in a
		// way an admin can fix.
		if err := json.Unmarshal([]byte(optionsRaw), &f.Options); err != nil {
			f.Options = []string{}
		}
		if f.Options == nil {
			f.Options = []string{}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *ReviewFieldRepo) byScope(ctx context.Context, scope, ref string) ([]models.ReviewField, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+fieldColumns+` FROM review_fields
		 WHERE scope = ? AND scope_ref = ? AND is_active = 1`, scope, ref)
	if err != nil {
		return nil, err
	}
	return scanFields(rows)
}

// CategoryOfProduct returns a product's category slug. Empty string and no
// error when the product does not exist — a reviewer naming a new product has
// no product row yet.
func (r *ReviewFieldRepo) CategoryOfProduct(ctx context.Context, productID int64) (string, error) {
	var slug string
	err := r.db.QueryRowContext(ctx, `SELECT category FROM products WHERE id = ?`, productID).Scan(&slug)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return slug, err
}

// resolveCategorySlug decides which category slug governs a Resolve call. A
// product's real category always wins over a caller-supplied slug: mixing an
// explicit category with a different product's own fields and hides would
// produce a result that is correct for neither input. The passed slug is
// used only when there is no product to derive one from.
func resolveCategorySlug(passedSlug string, productID int64, productCategory string) string {
	if productID != 0 {
		return productCategory
	}
	return passedSlug
}

// Resolve returns the fields a reviewer should see. productID may be 0, which
// resolves to the category's fields alone — the case where the reviewer typed
// a product name that does not exist yet. Whenever productID is non-zero, the
// product's own category always wins over any categorySlug the caller also
// passed — see resolveCategorySlug.
func (r *ReviewFieldRepo) Resolve(ctx context.Context, categorySlug string, productID int64) ([]models.ReviewField, error) {
	if productID != 0 {
		derived, err := r.CategoryOfProduct(ctx, productID)
		if err != nil {
			return nil, err
		}
		categorySlug = resolveCategorySlug(categorySlug, productID, derived)
	}

	var categoryFields []models.ReviewField
	if categorySlug != "" {
		var err error
		if categoryFields, err = r.byScope(ctx, "category", categorySlug); err != nil {
			return nil, err
		}
	}

	if productID == 0 {
		return MergeFields(categoryFields, nil, nil), nil
	}

	productFields, err := r.byScope(ctx, "product", strconv.FormatInt(productID, 10))
	if err != nil {
		return nil, err
	}

	hideRows, err := r.db.QueryContext(ctx,
		`SELECT field_id FROM product_field_hides WHERE product_id = ?`, productID)
	if err != nil {
		return nil, err
	}
	defer hideRows.Close()
	hidden := map[int64]bool{}
	for hideRows.Next() {
		var id int64
		if err := hideRows.Scan(&id); err != nil {
			return nil, err
		}
		hidden[id] = true
	}
	if err := hideRows.Err(); err != nil {
		return nil, err
	}

	return MergeFields(categoryFields, productFields, hidden), nil
}

// shouldHaveNumberValue checks if a field should store a numeric value.
func shouldHaveNumberValue(fieldType string) bool {
	return fieldType == "number"
}

// SaveValues writes the answers for a review. Values are keyed by field id.
// A number field also populates value_number so filtering can be added later
// without migrating historical rows. Other field types leave value_number NULL.
func (r *ReviewFieldRepo) SaveValues(ctx context.Context, reviewID int64, values map[int64]string, fields []models.ReviewField) error {
	if len(values) == 0 {
		return nil
	}

	// Build field id → type lookup
	fieldTypes := make(map[int64]string)
	for _, f := range fields {
		fieldTypes[f.ID] = f.Type
	}

	for fieldID, raw := range values {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		var num *float64
		fieldType := fieldTypes[fieldID]
		if shouldHaveNumberValue(fieldType) {
			if f, err := strconv.ParseFloat(raw, 64); err == nil {
				num = &f
			}
		}
		if _, err := r.db.ExecContext(ctx,
			`INSERT INTO review_field_values (review_id, field_id, value_text, value_number)
			 VALUES (?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), value_number = VALUES(value_number)`,
			reviewID, fieldID, raw, num); err != nil {
			return err
		}
	}
	return nil
}

// ValuesForReview returns a review's answers joined to their definitions, in
// display order. Deactivated fields are included: the answer was given, and
// hiding it would silently drop content the reviewer wrote.
func (r *ReviewFieldRepo) ValuesForReview(ctx context.Context, reviewID int64) ([]models.ReviewFieldValue, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT f.label, f.type, v.value_text
		FROM review_field_values v
		INNER JOIN review_fields f ON f.id = v.field_id
		WHERE v.review_id = ?
		ORDER BY f.sort_order, f.id`, reviewID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.ReviewFieldValue{}
	for rows.Next() {
		var v models.ReviewFieldValue
		var text sql.NullString
		if err := rows.Scan(&v.Label, &v.Type, &text); err != nil {
			return nil, err
		}
		v.Value = text.String
		out = append(out, v)
	}
	return out, rows.Err()
}
