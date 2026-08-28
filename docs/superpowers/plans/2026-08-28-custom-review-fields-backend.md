# Custom Review Fields — Backend & Reviewer Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-defined extra fields appear on the review form for a product's category, reviewers answer them, and the answers show on the review detail page.

**Architecture:** Three new tables. Field resolution (category defaults − product hides + product additions) lives in one repository method so the form, the submit validator, and later the CMS all compute the same list. A Redis layer caches the resolved list and is invalidated explicitly on admin write. Field definitions are seeded by SQL in this plan; the CMS builder is plan 2.

**Tech Stack:** Go 1.23, chi router, MySQL 8.4, Redis (go-redis v9), React 18 + Vite + TypeScript, TanStack Query, i18next (en + bn).

**Spec:** `docs/superpowers/specs/2026-08-28-custom-review-fields-design.md`

## Global Constraints

- **Go toolchain is not installed locally.** Every Go command runs through Docker:
  `docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./...` from `be/`.
- **Migrations do not auto-apply.** No runner exists in `main.go`. Apply by hand:
  `docker exec -i common-mysql-1 mysql -uroot -p"$DB_PASSWORD" review-new < be/migrations/013_custom_review_fields.sql`
- **Local DB is `review-new`** in the `common-mysql-1` container. Production is a separate VPS database named `reviewhub`.
- **`npm run build` does not typecheck.** Always verify the frontend with
  `cd fe && npx tsc --noEmit -p tsconfig.app.json`.
- **Every user-facing string needs `en` and `bn` translations** in `fe/src/locales/<loc>/translation.json`. Add keys under the existing `reviewForm` / `review` objects; never reformat the file.
- **Pushing to `main` deploys to production.** Work on a branch. Do not merge without being asked.
- **Field types are exactly:** `text`, `url`, `select`, `number`.
- **Cache key prefix is `reviewform:v1:`** — the `v1` is a response-shape version, not a feature version.

---

### Task 1: Migration and models

**Files:**
- Create: `be/migrations/013_custom_review_fields.sql`
- Modify: `be/internal/models/models.go` (append after the `Review` struct)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `review_fields`, `product_field_hides`, `review_field_values`; Go types `models.ReviewField` and `models.ReviewFieldValue`.

- [ ] **Step 1: Write the migration**

Create `be/migrations/013_custom_review_fields.sql`:

```sql
-- Custom review form fields: admin-defined inputs shown on the review form,
-- scoped to a category with per-product add/hide overrides.

CREATE TABLE IF NOT EXISTS review_fields (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope       ENUM('category','product') NOT NULL,
  scope_ref   VARCHAR(100) NOT NULL,
  field_key   VARCHAR(64)  NOT NULL,
  label       VARCHAR(200) NOT NULL,
  type        ENUM('text','url','select','number') NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  options     JSON NULL,
  min_value   DECIMAL(12,2) NULL,
  max_value   DECIMAL(12,2) NULL,
  help_text   VARCHAR(300) NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scope_key (scope, scope_ref, field_key),
  INDEX idx_scope (scope, scope_ref, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_field_hides (
  product_id BIGINT NOT NULL,
  field_id   BIGINT NOT NULL,
  PRIMARY KEY (product_id, field_id),
  CONSTRAINT fk_pfh_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfh_field   FOREIGN KEY (field_id)   REFERENCES review_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS review_field_values (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_id    BIGINT NOT NULL,
  field_id     BIGINT NOT NULL,
  value_text   VARCHAR(1000) NULL,
  value_number DECIMAL(12,2) NULL,
  CONSTRAINT fk_rfv_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_rfv_field  FOREIGN KEY (field_id)  REFERENCES review_fields(id) ON DELETE CASCADE,
  UNIQUE KEY uq_review_field (review_id, field_id),
  INDEX idx_field (field_id)
) ENGINE=InnoDB;
```

- [ ] **Step 2: Apply it and verify the tables exist**

```bash
cd /home/rafiur/Desktop/projects/final-review
PW=$(grep -E "^DB_PASSWORD=" be/.env | cut -d= -f2-)
docker exec -i common-mysql-1 mysql -uroot -p"$PW" review-new < be/migrations/013_custom_review_fields.sql
docker exec common-mysql-1 mysql -uroot -p"$PW" review-new -e "SHOW TABLES LIKE '%field%';"
```

Expected: three rows — `product_field_hides`, `review_field_values`, `review_fields`.

- [ ] **Step 3: Add the models**

Append to `be/internal/models/models.go`:

```go
// ReviewField is one admin-defined input on the review form. Scope is
// "category" (scope_ref is a category slug) or "product" (scope_ref is a
// product id in decimal text).
type ReviewField struct {
	ID         int64    `json:"id"`
	FieldKey   string   `json:"field_key"`
	Label      string   `json:"label"`
	Type       string   `json:"type"`
	IsRequired bool     `json:"is_required"`
	Options    []string `json:"options"`
	MinValue   *float64 `json:"min_value"`
	MaxValue   *float64 `json:"max_value"`
	HelpText   string   `json:"help_text"`
	SortOrder  int      `json:"-"`
}

// ReviewFieldValue is one answer, joined to its definition for display. Label
// and Type come from the definition so an answer to a since-deactivated field
// still renders with the label it was collected under.
type ReviewFieldValue struct {
	Label string `json:"label"`
	Type  string `json:"type"`
	Value string `json:"value"`
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go build ./...
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add be/migrations/013_custom_review_fields.sql be/internal/models/models.go
git commit -m "feat(review-fields): schema and models for custom review fields"
```

---

### Task 2: Resolution repository

**Files:**
- Create: `be/internal/repository/review_field.go`
- Test: `be/internal/repository/review_field_test.go`

**Interfaces:**
- Consumes: `models.ReviewField` from Task 1.
- Produces:
  - `repository.NewReviewFieldRepo(db *sql.DB) *ReviewFieldRepo`
  - `(*ReviewFieldRepo).Resolve(ctx context.Context, categorySlug string, productID int64) ([]models.ReviewField, error)`
  - `(*ReviewFieldRepo).CategoryOfProduct(ctx context.Context, productID int64) (string, error)`
  - `(*ReviewFieldRepo).SaveValues(ctx context.Context, reviewID int64, values map[int64]string) error`
  - `(*ReviewFieldRepo).ValuesForReview(ctx context.Context, reviewID int64) ([]models.ReviewFieldValue, error)`
  - `repository.MergeFields(categoryFields, productFields []models.ReviewField, hidden map[int64]bool) []models.ReviewField`

`MergeFields` is exported and pure so the merge rule can be tested without a database. `Resolve` does the three queries and calls it.

- [ ] **Step 1: Write the failing merge test**

Create `be/internal/repository/review_field_test.go`:

```go
package repository

import (
	"testing"

	"final-review/be/internal/models"
)

func names(fs []models.ReviewField) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, f.FieldKey)
	}
	return out
}

func eq(t *testing.T, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestMergeFieldsInheritsCategoryFields(t *testing.T) {
	cat := []models.ReviewField{
		{ID: 1, FieldKey: "page_link", SortOrder: 10},
		{ID: 2, FieldKey: "delivery_days", SortOrder: 20},
	}
	eq(t, names(MergeFields(cat, nil, nil)), "page_link", "delivery_days")
}

func TestMergeFieldsAddsProductFields(t *testing.T) {
	cat := []models.ReviewField{{ID: 1, FieldKey: "page_link", SortOrder: 10}}
	prod := []models.ReviewField{{ID: 5, FieldKey: "instagram", SortOrder: 20}}
	eq(t, names(MergeFields(cat, prod, nil)), "page_link", "instagram")
}

func TestMergeFieldsHidesInherited(t *testing.T) {
	cat := []models.ReviewField{
		{ID: 1, FieldKey: "page_link", SortOrder: 10},
		{ID: 2, FieldKey: "delivery_days", SortOrder: 20},
	}
	prod := []models.ReviewField{{ID: 5, FieldKey: "instagram", SortOrder: 30}}
	eq(t, names(MergeFields(cat, prod, map[int64]bool{2: true})), "page_link", "instagram")
}

func TestMergeFieldsHideAppliesOnlyToCategoryFields(t *testing.T) {
	// A product cannot hide its own field — it would just delete it instead.
	// A stale hide row naming a product field must not remove it.
	prod := []models.ReviewField{{ID: 5, FieldKey: "instagram", SortOrder: 10}}
	eq(t, names(MergeFields(nil, prod, map[int64]bool{5: true})), "instagram")
}

func TestMergeFieldsOrdersBySortOrderThenID(t *testing.T) {
	cat := []models.ReviewField{{ID: 9, FieldKey: "b", SortOrder: 5}}
	prod := []models.ReviewField{
		{ID: 3, FieldKey: "a", SortOrder: 5},
		{ID: 4, FieldKey: "c", SortOrder: 1},
	}
	// sort_order first, then id as the tiebreak
	eq(t, names(MergeFields(cat, prod, nil)), "c", "a", "b")
}

func TestMergeFieldsEmpty(t *testing.T) {
	if got := MergeFields(nil, nil, nil); len(got) != 0 {
		t.Fatalf("got %v, want empty", got)
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./internal/repository/ -run MergeFields
```

Expected: FAIL — `undefined: MergeFields`.

- [ ] **Step 3: Write the repository**

Create `be/internal/repository/review_field.go`:

```go
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

// Resolve returns the fields a reviewer should see. productID may be 0, which
// resolves to the category's fields alone — the case where the reviewer typed
// a product name that does not exist yet.
func (r *ReviewFieldRepo) Resolve(ctx context.Context, categorySlug string, productID int64) ([]models.ReviewField, error) {
	if productID != 0 && categorySlug == "" {
		slug, err := r.CategoryOfProduct(ctx, productID)
		if err != nil {
			return nil, err
		}
		categorySlug = slug
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
		if hideRows.Scan(&id) == nil {
			hidden[id] = true
		}
	}

	return MergeFields(categoryFields, productFields, hidden), nil
}

// SaveValues writes the answers for a review. Values are keyed by field id.
// A number field also populates value_number so filtering can be added later
// without migrating historical rows.
func (r *ReviewFieldRepo) SaveValues(ctx context.Context, reviewID int64, values map[int64]string) error {
	if len(values) == 0 {
		return nil
	}
	for fieldID, raw := range values {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		var num *float64
		if f, err := strconv.ParseFloat(raw, 64); err == nil {
			num = &f
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./internal/repository/ -run MergeFields -v
```

Expected: all six `TestMergeFields*` PASS.

- [ ] **Step 5: Commit**

```bash
git add be/internal/repository/review_field.go be/internal/repository/review_field_test.go
git commit -m "feat(review-fields): resolution repository with category/product merge"
```

---

### Task 3: Redis cache with fan-out invalidation

**Files:**
- Create: `be/internal/repository/review_field_cache.go`
- Test: `be/internal/repository/review_field_cache_test.go`

**Interfaces:**
- Consumes: `*ReviewFieldRepo` from Task 2.
- Produces:
  - `repository.NewReviewFieldCache(repo *ReviewFieldRepo, rdb *redis.Client) *ReviewFieldCache`
  - `(*ReviewFieldCache).Resolve(ctx, categorySlug string, productID int64) ([]models.ReviewField, error)`
  - `(*ReviewFieldCache).InvalidateCategory(ctx, slug string) error`
  - `(*ReviewFieldCache).InvalidateProduct(ctx, productID int64) error`
  - `repository.CategoryKey(slug string) string`, `repository.ProductKey(id int64) string`, `repository.MembersKey(slug string) string`

- [ ] **Step 1: Write the failing key-shape test**

Create `be/internal/repository/review_field_cache_test.go`:

```go
package repository

import "testing"

func TestCacheKeyShapes(t *testing.T) {
	if got := CategoryKey("fcommerce"); got != "reviewform:v1:cat:fcommerce" {
		t.Errorf("CategoryKey = %q", got)
	}
	if got := ProductKey(42); got != "reviewform:v1:prod:42" {
		t.Errorf("ProductKey = %q", got)
	}
	if got := MembersKey("fcommerce"); got != "reviewform:v1:cat:fcommerce:members" {
		t.Errorf("MembersKey = %q", got)
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./internal/repository/ -run CacheKeyShapes
```

Expected: FAIL — `undefined: CategoryKey`.

- [ ] **Step 3: Write the cache**

Create `be/internal/repository/review_field_cache.go`:

```go
package repository

import (
	"context"
	"encoding/json"
	"log"
	"strconv"

	"github.com/redis/go-redis/v9"

	"final-review/be/internal/models"
)

// The v1 in these keys is the cached response shape, not the feature version.
// Changing the shape of models.ReviewField means bumping it, so old entries are
// never read again and no flush is needed.
func CategoryKey(slug string) string  { return "reviewform:v1:cat:" + slug }
func ProductKey(id int64) string      { return "reviewform:v1:prod:" + strconv.FormatInt(id, 10) }
func MembersKey(slug string) string   { return "reviewform:v1:cat:" + slug + ":members" }

// ReviewFieldCache serves resolved field lists from Redis, falling back to the
// repository. The form must load even when Redis is down, so every cache error
// degrades to a direct read rather than failing the request.
type ReviewFieldCache struct {
	repo *ReviewFieldRepo
	rdb  *redis.Client
}

func NewReviewFieldCache(repo *ReviewFieldRepo, rdb *redis.Client) *ReviewFieldCache {
	return &ReviewFieldCache{repo: repo, rdb: rdb}
}

func (c *ReviewFieldCache) Resolve(ctx context.Context, categorySlug string, productID int64) ([]models.ReviewField, error) {
	key := CategoryKey(categorySlug)
	if productID != 0 {
		key = ProductKey(productID)
	}

	if c.rdb != nil {
		if raw, err := c.rdb.Get(ctx, key).Result(); err == nil {
			var fields []models.ReviewField
			if json.Unmarshal([]byte(raw), &fields) == nil {
				return fields, nil
			}
			// Unreadable entry: fall through and rebuild rather than serve nothing.
		}
	}

	fields, err := c.repo.Resolve(ctx, categorySlug, productID)
	if err != nil {
		return nil, err
	}

	if c.rdb != nil {
		if blob, err := json.Marshal(fields); err == nil {
			// No TTL: entries live until an admin write invalidates them.
			if err := c.rdb.Set(ctx, key, blob, 0).Err(); err != nil {
				log.Printf("WARN review-field cache set %s: %v", key, err)
			}
			// Record which products drew on this category, so a later category
			// edit can clear their keys without scanning. KEYS is not usable
			// on a production Redis.
			if productID != 0 {
				slug := categorySlug
				if slug == "" {
					if s, err := c.repo.CategoryOfProduct(ctx, productID); err == nil {
						slug = s
					}
				}
				if slug != "" {
					c.rdb.SAdd(ctx, MembersKey(slug), productID)
				}
			}
		}
	}
	return fields, nil
}

// InvalidateCategory clears a category's entry and every product entry that
// inherited from it. Missing the fan-out is the failure this whole members-set
// design exists to prevent: the category would refresh while its products kept
// serving the old field list.
func (c *ReviewFieldCache) InvalidateCategory(ctx context.Context, slug string) error {
	if c.rdb == nil {
		return nil
	}
	members, err := c.rdb.SMembers(ctx, MembersKey(slug)).Result()
	if err != nil && err != redis.Nil {
		return err
	}
	keys := make([]string, 0, len(members)+2)
	keys = append(keys, CategoryKey(slug), MembersKey(slug))
	for _, m := range members {
		if id, err := strconv.ParseInt(m, 10, 64); err == nil {
			keys = append(keys, ProductKey(id))
		}
	}
	return c.rdb.Del(ctx, keys...).Err()
}

// InvalidateProduct clears one product's entry. Its category is untouched:
// a product-level change cannot affect what any other product resolves to.
func (c *ReviewFieldCache) InvalidateProduct(ctx context.Context, productID int64) error {
	if c.rdb == nil {
		return nil
	}
	return c.rdb.Del(ctx, ProductKey(productID)).Err()
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./internal/repository/ -run CacheKeyShapes -v
```

Expected: PASS.

- [ ] **Step 5: Verify invalidation against the real Redis**

The fan-out is the risky part of this feature and unit tests with a nil client do not exercise it. Verify by hand:

```bash
docker exec common-redis-1 redis-cli SET "reviewform:v1:cat:fcommerce" '[]'
docker exec common-redis-1 redis-cli SET "reviewform:v1:prod:12" '[]'
docker exec common-redis-1 redis-cli SADD "reviewform:v1:cat:fcommerce:members" 12
docker exec common-redis-1 redis-cli KEYS "reviewform:v1:*"
```

Expected: three keys. After Task 5 wires the admin endpoint, editing an `fcommerce` field must leave zero of them.

- [ ] **Step 6: Commit**

```bash
git add be/internal/repository/review_field_cache.go be/internal/repository/review_field_cache_test.go
git commit -m "feat(review-fields): redis cache with category-to-product invalidation fan-out"
```

---

### Task 4: Public endpoint and router wiring

**Files:**
- Create: `be/internal/handlers/review_fields.go`
- Modify: `be/internal/router/router.go` (repo block near line 68, handler block near line 85, public routes near line 131)

**Interfaces:**
- Consumes: `*ReviewFieldCache` from Task 3.
- Produces:
  - `handlers.NewReviewFieldHandler(cache *repository.ReviewFieldCache) *ReviewFieldHandler`
  - `(*ReviewFieldHandler).List(w, r)` serving `GET /api/v1/review-fields`
  - router locals `reviewFieldRepo`, `reviewFieldCache` for Tasks 5 and 6.

- [ ] **Step 1: Write the handler**

Create `be/internal/handlers/review_fields.go`:

```go
package handlers

import (
	"net/http"
	"strconv"

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
```

Add `"final-review/be/internal/models"` to the import block.

- [ ] **Step 2: Wire the router**

In `be/internal/router/router.go`, after line 69 (`reviewRepo := ...`):

```go
	reviewFieldRepo := repository.NewReviewFieldRepo(db)
	reviewFieldCache := repository.NewReviewFieldCache(reviewFieldRepo, rdb)
```

After line 85 (`reviewH := ...`):

```go
	reviewFieldH := handlers.NewReviewFieldHandler(reviewFieldCache)
```

In the public route block (near line 131, alongside `r.Get("/reviews/{id}", ...)`):

```go
		r.Get("/review-fields", reviewFieldH.List)
```

- [ ] **Step 3: Build and restart**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go build ./...
docker compose up -d --force-recreate api && sleep 14 && docker compose logs api --tail 3
```

Expected: `server listening on :8080`.

- [ ] **Step 4: Seed a field and verify the endpoint**

```bash
cd /home/rafiur/Desktop/projects/final-review
PW=$(grep -E "^DB_PASSWORD=" be/.env | cut -d= -f2-)
docker exec common-mysql-1 mysql -uroot -p"$PW" review-new -e "
INSERT INTO review_fields (scope, scope_ref, field_key, label, type, is_required, sort_order)
VALUES ('category','service','page_link','Facebook page link','url',1,10);"
curl -s "http://localhost:8080/api/v1/review-fields?category=service" | python3 -m json.tool
curl -s "http://localhost:8080/api/v1/review-fields" | python3 -m json.tool
```

Expected: the first returns one field with `"type": "url"` and `"is_required": true`; the second returns `[]`.

- [ ] **Step 5: Verify it was cached**

```bash
docker exec common-redis-1 redis-cli GET "reviewform:v1:cat:service"
```

Expected: the JSON field list.

- [ ] **Step 6: Commit**

```bash
git add be/internal/handlers/review_fields.go be/internal/router/router.go
git commit -m "feat(review-fields): public GET /review-fields endpoint"
```

---

### Task 5: Admin CRUD with invalidation

**Files:**
- Create: `be/internal/handlers/admin_review_fields.go`
- Modify: `be/internal/handlers/admin.go:26-39` (add cache to `AdminHandler`)
- Modify: `be/internal/router/router.go` (admin route block near line 200, and the `NewAdminHandler` call near line 90)

**Interfaces:**
- Consumes: `*ReviewFieldCache` from Task 3, `reviewFieldCache` router local from Task 4.
- Produces: `(*AdminHandler).ListReviewFields`, `.CreateReviewField`, `.UpdateReviewField`, `.DeleteReviewField`, `.SetFieldHide`.

- [ ] **Step 1: Add the cache to AdminHandler**

In `be/internal/handlers/admin.go`, add to the struct and constructor:

```go
	fieldCache *repository.ReviewFieldCache
```

and the constructor parameter `fc *repository.ReviewFieldCache`, assigned `fieldCache: fc`. Update the `NewAdminHandler(...)` call in `router.go` to pass `reviewFieldCache` as the final argument.

- [ ] **Step 2: Write the handlers**

Create `be/internal/handlers/admin_review_fields.go`:

```go
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
```

- [ ] **Step 3: Register the routes**

In `router.go`, inside the admin block (near line 200):

```go
			r.Get("/admin/review-fields", adminH.ListReviewFields)
			r.Post("/admin/review-fields", adminH.CreateReviewField)
			r.Patch("/admin/review-fields/{id}", adminH.UpdateReviewField)
			r.Delete("/admin/review-fields/{id}", adminH.DeleteReviewField)
			r.Post("/admin/products/{id}/field-hides", adminH.SetFieldHide)
```

- [ ] **Step 4: Build, restart, and verify the invalidation fan-out**

This is the step that proves the risky part works.

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go build ./... \
  && docker compose up -d --force-recreate api && sleep 14
cd ..
# warm both keys and the members set
curl -s "http://localhost:8080/api/v1/review-fields?category=service" >/dev/null
curl -s "http://localhost:8080/api/v1/review-fields?product_id=5" >/dev/null
docker exec common-redis-1 redis-cli KEYS "reviewform:v1:*"
```

Expected: `reviewform:v1:cat:service`, `reviewform:v1:prod:5`, `reviewform:v1:cat:service:members`.

Now edit the category field as an admin (obtain a token by logging into the CMS, or create a temporary admin as in `be/internal/handlers/admin_images_test.go`'s manual flow), then:

```bash
docker exec common-redis-1 redis-cli KEYS "reviewform:v1:*"
```

Expected: **no keys**. If `reviewform:v1:prod:5` survives, the fan-out is broken — product 5 would keep serving the old field list indefinitely, since there is no TTL.

- [ ] **Step 5: Commit**

```bash
git add be/internal/handlers/admin_review_fields.go be/internal/handlers/admin.go be/internal/router/router.go
git commit -m "feat(review-fields): admin CRUD with explicit cache invalidation"
```

---

### Task 6: Submit validation and review display

**Files:**
- Modify: `be/internal/handlers/reviews.go:122-200` (Create), and the `ReviewHandler` struct/constructor near line 24
- Modify: `be/internal/router/router.go:85` (pass the new dependency)
- Modify: `be/internal/repository/review.go` `FindByID` (attach values)
- Modify: `be/internal/models/models.go` (`Review` gains `CustomFields`)
- Test: `be/internal/handlers/review_fields_validate_test.go`

**Interfaces:**
- Consumes: `Resolve`, `SaveValues`, `ValuesForReview` from Tasks 2–3.
- Produces: `handlers.ValidateFieldAnswers(fields []models.ReviewField, submitted map[string]string) (map[int64]string, string)` — returns values keyed by field id, and an error message (empty when valid).

- [ ] **Step 1: Write the failing validation test**

Create `be/internal/handlers/review_fields_validate_test.go`:

```go
package handlers

import (
	"testing"

	"final-review/be/internal/models"
)

func f(id int64, typ string, required bool) models.ReviewField {
	return models.ReviewField{ID: id, FieldKey: "k", Label: "L", Type: typ, IsRequired: required}
}

func TestValidateAcceptsGoodAnswers(t *testing.T) {
	fields := []models.ReviewField{f(1, "url", true), f(2, "number", false)}
	vals, msg := ValidateFieldAnswers(fields, map[string]string{"1": "https://facebook.com/x", "2": "3"})
	if msg != "" {
		t.Fatalf("msg = %q, want empty", msg)
	}
	if vals[1] != "https://facebook.com/x" || vals[2] != "3" {
		t.Fatalf("vals = %v", vals)
	}
}

func TestValidateRejectsMissingRequired(t *testing.T) {
	fields := []models.ReviewField{f(1, "text", true)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{}); msg == "" {
		t.Fatal("want an error for a missing required field")
	}
}

func TestValidateTreatsBlankAsMissing(t *testing.T) {
	fields := []models.ReviewField{f(1, "text", true)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "   "}); msg == "" {
		t.Fatal("whitespace must not satisfy a required field")
	}
}

func TestValidateIgnoresUnknownKeys(t *testing.T) {
	// An admin editing fields while a reviewer has the form open must not turn
	// their submit into an error.
	fields := []models.ReviewField{f(1, "text", false)}
	vals, msg := ValidateFieldAnswers(fields, map[string]string{"1": "ok", "999": "stale"})
	if msg != "" {
		t.Fatalf("msg = %q, want empty", msg)
	}
	if _, present := vals[999]; present {
		t.Fatal("unknown key must not be stored")
	}
}

func TestValidateRejectsBadURL(t *testing.T) {
	fields := []models.ReviewField{f(1, "url", false)}
	for _, bad := range []string{"notaurl", "ftp://x.com", "javascript:alert(1)"} {
		if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": bad}); msg == "" {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestValidateRejectsNonNumeric(t *testing.T) {
	fields := []models.ReviewField{f(1, "number", false)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "three"}); msg == "" {
		t.Fatal("want an error for a non-numeric number field")
	}
}

func TestValidateEnforcesNumberRange(t *testing.T) {
	min, max := 1.0, 10.0
	fields := []models.ReviewField{{ID: 1, Type: "number", Label: "Days", MinValue: &min, MaxValue: &max}}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "50"}); msg == "" {
		t.Fatal("want an error above max_value")
	}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "5"}); msg != "" {
		t.Fatalf("in-range value rejected: %s", msg)
	}
}

func TestValidateRejectsUnlistedSelectOption(t *testing.T) {
	fields := []models.ReviewField{{ID: 1, Type: "select", Label: "How", Options: []string{"Facebook", "WhatsApp"}}}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "Telegram"}); msg == "" {
		t.Fatal("want an error for an option not in the list")
	}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "WhatsApp"}); msg != "" {
		t.Fatalf("listed option rejected: %s", msg)
	}
}

func TestValidateRejectsOverlongText(t *testing.T) {
	long := make([]byte, 1001)
	for i := range long {
		long[i] = 'a'
	}
	fields := []models.ReviewField{f(1, "text", false)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": string(long)}); msg == "" {
		t.Fatal("want an error above 1000 characters")
	}
}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./internal/handlers/ -run Validate
```

Expected: FAIL — `undefined: ValidateFieldAnswers`.

- [ ] **Step 3: Write the validator**

Append to `be/internal/handlers/review_fields.go`:

```go
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
```

Add `"net/url"`, `"strings"`, and `"final-review/be/internal/models"` to that file's imports.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 go test ./internal/handlers/ -run Validate -v
```

Expected: all nine `TestValidate*` PASS.

- [ ] **Step 5: Wire validation into review creation**

Add `fields *repository.ReviewFieldCache` and `fieldRepo *repository.ReviewFieldRepo` to `ReviewHandler` (line 20-26) and to `NewReviewHandler`; pass `reviewFieldCache` and `reviewFieldRepo` at `router.go:85`.

In `Create`, immediately **before** `h.reviews.Create(...)` at line 177 — so a bad answer fails before a review row exists:

```go
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
```

And immediately **after** the review row is created:

```go
	if err := h.fieldRepo.SaveValues(r.Context(), reviewID, fieldValues); err != nil {
		log.Printf("WARN review %d: saving custom field answers: %v", reviewID, err)
	}
```

Saving answers is logged rather than fatal: the review itself is the thing worth keeping, and failing here would leave a created review reported to the client as an error.

- [ ] **Step 6: Attach values to the review response**

In `models.go`, add to `Review`:

```go
	CustomFields []ReviewFieldValue `json:"custom_fields,omitempty"`
```

`omitempty` keeps every existing review's response byte-identical.

In `be/internal/repository/review.go`, at the end of `FindByID` before `return &rv, nil`:

```go
	if vals, err := NewReviewFieldRepo(r.db).ValuesForReview(ctx, id); err == nil {
		rv.CustomFields = vals
	}
```

- [ ] **Step 7: Verify end to end**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 sh -c "go build ./... && go vet ./... && go test ./..." | tail -6
docker compose up -d --force-recreate api && sleep 14
```

Then register a user, obtain a token, and submit a review for a product in the `service` category with `fields={"<id>":"https://facebook.com/x"}` as a multipart field. Confirm:
- omitting a required field returns 400 naming the label
- a bad URL returns 400
- a valid submit returns 201 and `GET /api/v1/reviews/{id}` includes `custom_fields`

- [ ] **Step 8: Commit**

```bash
git add be/internal/handlers/reviews.go be/internal/handlers/review_fields.go \
        be/internal/handlers/review_fields_validate_test.go \
        be/internal/repository/review.go be/internal/models/models.go be/internal/router/router.go
git commit -m "feat(review-fields): validate answers on submit and return them on the review"
```

---

### Task 7: Reviewer form renders the fields

**Files:**
- Create: `fe/src/components/CustomFieldInputs.tsx`
- Modify: `fe/src/components/ReviewForm.tsx` (state near line 41, submit near line 197, render between Rating and Content)
- Modify: `fe/src/lib/api.ts` (types)
- Modify: `fe/src/locales/en/translation.json`, `fe/src/locales/bn/translation.json`

**Interfaces:**
- Consumes: `GET /api/v1/review-fields` from Task 4; the `fields` multipart part from Task 6.
- Produces: `<CustomFieldInputs fields values onChange />`, and `ApiReviewField` in `api.ts`.

- [ ] **Step 1: Add the type and translations**

In `fe/src/lib/api.ts`, before `apiFetch`:

```ts
export interface ApiReviewField {
  id: number;
  field_key: string;
  label: string;
  type: "text" | "url" | "select" | "number";
  is_required: boolean;
  options: string[];
  min_value: number | null;
  max_value: number | null;
  help_text: string;
}
```

Add to `reviewForm` in both locale files — `en`:
`"customFieldRequired": "{{label}} is required"`, `"selectPlaceholder": "Choose one"`.
`bn`: `"customFieldRequired": "{{label}} আবশ্যক"`, `"selectPlaceholder": "একটি বেছে নিন"`.

- [ ] **Step 2: Write the input renderer**

Create `fe/src/components/CustomFieldInputs.tsx`:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import type { ApiReviewField } from "@/lib/api";

interface Props {
  fields: ApiReviewField[];
  values: Record<number, string>;
  onChange: (fieldId: number, value: string) => void;
}

/**
 * Renders the admin-defined fields for the selected product or category.
 * The server re-resolves and re-validates on submit, so nothing here is a
 * security boundary — it exists to tell the reviewer what is expected.
 */
export function CustomFieldInputs({ fields, values, onChange }: Props) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((f) => (
        <div key={f.id} className="space-y-2">
          <Label htmlFor={`cf-${f.id}`}>
            {f.label}
            {f.is_required && <span className="ml-1 text-destructive">*</span>}
          </Label>

          {f.type === "select" ? (
            <select
              id={`cf-${f.id}`}
              value={values[f.id] ?? ""}
              onChange={(e) => onChange(f.id, e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("reviewForm.selectPlaceholder")}</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <Input
              id={`cf-${f.id}`}
              type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
              inputMode={f.type === "number" ? "decimal" : undefined}
              min={f.min_value ?? undefined}
              max={f.max_value ?? undefined}
              value={values[f.id] ?? ""}
              onChange={(e) => onChange(f.id, e.target.value)}
              className="bg-background"
            />
          )}

          {f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Wire it into the form**

In `ReviewForm.tsx`, add state beside the existing `formData`:

```tsx
  const [customValues, setCustomValues] = useState<Record<number, string>>({});
```

Fetch, keyed so it re-runs when either input changes:

```tsx
  const { data: customFields = [] } = useQuery<ApiReviewField[]>({
    queryKey: ["review-fields", selectedProduct?.id ?? null, formData.category],
    queryFn: () =>
      apiFetch(
        selectedProduct
          ? `/review-fields?product_id=${selectedProduct.id}`
          : `/review-fields?category=${encodeURIComponent(formData.category)}`
      ),
    enabled: Boolean(selectedProduct || formData.category),
  });
```

Drop answers to fields that are no longer offered, keeping the rest — re-selecting a product must not wipe what the reviewer typed:

```tsx
  useEffect(() => {
    setCustomValues((prev) => {
      const allowed = new Set(customFields.map((f) => f.id));
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(Number(k))) next[Number(k)] = v;
      }
      return next;
    });
  }, [customFields]);
```

Render between the Rating block and the Content block:

```tsx
      <CustomFieldInputs
        fields={customFields}
        values={customValues}
        onChange={(id, v) => setCustomValues((p) => ({ ...p, [id]: v }))}
      />
```

Block submit on a missing required field, before the existing `apiFetch` at line 197:

```tsx
    const missing = customFields.find(
      (f) => f.is_required && !(customValues[f.id] ?? "").trim()
    );
    if (missing) {
      toast({
        title: t("reviewForm.customFieldRequired", { label: missing.label }),
        variant: "destructive",
      });
      return;
    }
    fd.append("fields", JSON.stringify(customValues));
```

Import `CustomFieldInputs` and `type ApiReviewField`.

- [ ] **Step 4: Typecheck**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output.

- [ ] **Step 5: Verify in the running app**

With a field seeded on the `service` category (Task 4, Step 4), open `http://localhost:5173/write-review`, pick a `service` product, and confirm the field appears between Rating and Content, that submitting without it is blocked, and that a completed submit stores the answer.

- [ ] **Step 6: Commit**

```bash
git add fe/src/components/CustomFieldInputs.tsx fe/src/components/ReviewForm.tsx \
        fe/src/lib/api.ts fe/src/locales/en/translation.json fe/src/locales/bn/translation.json
git commit -m "feat(fe): render custom review fields on the review form"
```

---

### Task 8: Show answers on the review detail page

**Files:**
- Modify: `fe/src/pages/ReviewDetails.tsx` (after the content block)
- Modify: `fe/src/lib/api.ts` (`ApiReviewDetail`)

**Interfaces:**
- Consumes: `custom_fields` from Task 6.
- Produces: nothing downstream.

- [ ] **Step 1: Add the type**

In `api.ts`, add to `ApiReviewDetail`:

```ts
  custom_fields?: { label: string; type: string; value: string }[];
```

- [ ] **Step 2: Render them**

In `ReviewDetails.tsx`, after the review content paragraph:

```tsx
            {review.custom_fields && review.custom_fields.length > 0 && (
              <dl className="mb-8 grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
                {review.custom_fields.map((f, i) => (
                  <div key={i}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="text-sm font-medium text-foreground break-words">
                      {f.type === "url" ? (
                        <a
                          href={f.value}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-primary hover:underline"
                        >
                          {f.value}
                        </a>
                      ) : (
                        f.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
```

`rel="noopener noreferrer nofollow"` matches the treatment already used for `source_url`: these links are reviewer-supplied and must not pass ranking signal.

- [ ] **Step 3: Typecheck and look at it**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json
```

Then open a review that has answers and confirm a `url` answer renders as a working link and a `text` answer as plain text.

- [ ] **Step 4: Full verification**

```bash
cd be && docker run --rm -v "$PWD":/src -w /src -v go-mod-cache:/go/pkg/mod golang:1.23 sh -c "gofmt -l internal/ && go build ./... && go vet ./... && go test ./..." | grep -v "no test files"
cd ../fe && npx tsc --noEmit -p tsconfig.app.json && npm run lint 2>&1 | tail -2
```

Expected: tests pass; `gofmt` lists nothing under the new files; lint shows **36 problems**, unchanged from the baseline. A higher count means this work introduced one.

- [ ] **Step 5: Commit**

```bash
git add fe/src/pages/ReviewDetails.tsx fe/src/lib/api.ts
git commit -m "feat(fe): show custom field answers on the review detail page"
```

---

## Self-Review

**Spec coverage.** Data model → Task 1. Resolution → Task 2. Caching and fan-out → Tasks 3, 5. Public API → Task 4. Admin API → Task 5. Submit validation table (all six rules) → Task 6. `custom_fields` on read → Tasks 6, 8. Reviewer form including answer-preservation → Task 7. Soft delete → Task 5. The spec's CMS section is deliberately **not** here — it is plan 2.

**Placeholders.** None: every code step carries the code, every test step the assertions, every verification step the command and its expected output.

**Type consistency.** `MergeFields`, `Resolve`, `SaveValues`, `ValuesForReview`, `ValidateFieldAnswers`, `CategoryKey`/`ProductKey`/`MembersKey` are used in later tasks exactly as defined in earlier ones. `models.ReviewField` and `models.ReviewFieldValue` (Task 1) are the shapes Tasks 2, 6, 7, 8 consume. `ApiReviewField` mirrors `models.ReviewField`'s JSON tags field for field.

**Known gap, deliberate.** Until plan 2 ships the CMS builder, fields are created with SQL. Task 4 Step 4 gives the exact insert.
