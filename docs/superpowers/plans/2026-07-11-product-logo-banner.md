# Product Logo & Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give products a brand `logo` (shown fitted on the home page, with a styled category placeholder fallback) and a wide `banner` (shown as the product-detail hero), uploadable by both admins (CMS) and verified owners (FE), with logo/banner files stored in separate upload subfolders.

**Architecture:** Add `logo_url`/`banner_url` columns to `products`. The Go `Storage.Store` method gains a `subdir` argument so the shared upload endpoint can route files into `uploads/logos/` and `uploads/banners/`. Admin and a new owner-guarded endpoint persist the URLs. The public React app renders a shared `ProductLogo` component (fitted logo or category placeholder) on the home cards, a banner hero on the detail page, and an owner upload panel; the CMS gets logo/banner upload fields.

**Tech Stack:** Go 1.22 (chi router, database/sql + MySQL), React 18 + Vite + TypeScript, TanStack Query, shadcn/ui, Tailwind.

## Global Constraints

- Backend module path: `final-review/be`. Product categories are exactly `physical`, `digital`, `service` (MySQL ENUM).
- The existing `image_url` column/field is left intact everywhere — never renamed, dropped, or removed from payloads. It is simply no longer featured on the home page.
- All product image path fields returned by the API must be passed through `absURL(r.baseURL, …)` in the repository, exactly like `image_url` today.
- Stored relative paths look like `uploads/<file>` (default) or `uploads/<subdir>/<file>`. The `URL()`/`absURL()` pass-through for `http`-prefixed and empty strings must be preserved.
- The Go toolchain is not on the local PATH; the backend builds/runs via Docker (`docker-compose.yml`). Backend verification uses `docker compose` build + `curl`, except the pure-filesystem storage logic which has real Go unit tests (run inside the Go container).
- Frontend: path alias `@/` → `src/`. Use the existing `apiFetch` helper and `cn()`. There is no frontend test suite — frontend verification is `npm run build` + manual UI check.
- Commit after each task. Do not push.

---

## File Structure

**Backend (`be/`)**
- `migrations/009_product_brand_assets.sql` — new: adds `logo_url`, `banner_url`.
- `internal/models/models.go` — modify: `Product` gains `LogoURL`, `BannerURL`.
- `internal/repository/product.go` — modify: `List`, `FindByID` select/scan/absURL the new fields.
- `internal/storage/storage.go` — modify: `Store` signature gains `subdir`.
- `internal/storage/local.go` — modify: `Store` writes to subdir; `Delete` handles sub-paths safely.
- `internal/storage/local_test.go` — new: unit tests for subdir store + safe delete.
- `internal/handlers/upload.go` — modify: read + validate `folder` form field.
- `internal/handlers/admin.go` — modify: `CreateProduct`/`UpdateProduct` accept logo/banner.
- `internal/handlers/profile.go` — modify: `MyProducts` returns logo/banner; new `UpdateProduct` (owner).
- `internal/repository/product.go` — modify: add `UpdateBrandAssets` owner-guarded method.
- `internal/router/router.go` — modify: register `PATCH /profile/products/{id}`.

**Frontend (`fe/`)**
- `src/components/ProductLogo.tsx` — new: fitted logo or category placeholder.
- `src/components/ReviewedProducts.tsx` — modify: use `ProductLogo`.
- `src/components/ReviewedProductsGrid.tsx` — modify: use `ProductLogo`.
- `src/pages/ProductReviews.tsx` — modify: banner hero.
- `src/pages/OwnerDashboard.tsx` — modify: brand-assets upload panel.
- `src/lib/api.ts` — modify: `ApiProduct`, `ApiOwnerProduct` gain logo/banner.

**CMS (`cms/`)**
- `src/lib/api.ts` — modify: `AdminProduct` gains logo/banner; `uploadImage` gains `folder`.
- `src/pages/Products.tsx` — modify: logo/banner upload fields in dialog.

---

## Task 1: Database migration for logo_url and banner_url

**Files:**
- Create: `be/migrations/009_product_brand_assets.sql`

**Interfaces:**
- Produces: `products.logo_url VARCHAR(500) NULL`, `products.banner_url VARCHAR(500) NULL`.

- [ ] **Step 1: Write the migration**

Create `be/migrations/009_product_brand_assets.sql`:

```sql
-- 009_product_brand_assets.sql
-- Adds brand logo and banner image columns to products.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS logo_url   VARCHAR(500) NULL AFTER image_url,
  ADD COLUMN IF NOT EXISTS banner_url VARCHAR(500) NULL AFTER logo_url;
```

- [ ] **Step 2: Verify migrations are applied on startup**

Confirm how migrations run so this file is picked up. Run:

```bash
grep -rn "migrations" be/internal/database/ be/cmd/ | grep -iv "//"
```

Expected: a routine that reads the `migrations/` directory in sorted order (so `009_…` runs after `008_…`). If migrations are applied via a numbered runner, no code change is needed. If a hardcoded list exists, add `009_product_brand_assets.sql` to it.

- [ ] **Step 3: Apply and verify the column exists**

Bring up the DB and app via Docker, then check the schema:

```bash
docker compose up -d db
docker compose exec db sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SHOW COLUMNS FROM products LIKE \"%_url\";"'
```

Expected: rows for `image_url`, `logo_url`, `banner_url`. (Substitute the compose service/env names from `docker-compose.yml` if different.)

- [ ] **Step 4: Commit**

```bash
git add be/migrations/009_product_brand_assets.sql
git commit -m "feat(be): add products.logo_url and banner_url columns"
```

---

## Task 2: Expose logo_url and banner_url from the product API

**Files:**
- Modify: `be/internal/models/models.go:19-27` (`Product` struct)
- Modify: `be/internal/repository/product.go` (`List` ~lines 52-83, `FindByID` ~lines 92-107)

**Interfaces:**
- Consumes: `products.logo_url`, `products.banner_url` from Task 1; `absURL(base, raw string) string` from `be/internal/repository/url.go`.
- Produces: JSON fields `logo_url`, `banner_url` on `GET /products` and `GET /products/{id}`; `models.Product.LogoURL`, `models.Product.BannerURL`.

- [ ] **Step 1: Add fields to the Product model**

In `be/internal/models/models.go`, extend the `Product` struct (after `ImageURL`):

```go
type Product struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	ImageURL    string    `json:"image_url"`
	LogoURL     string    `json:"logo_url"`
	BannerURL   string    `json:"banner_url"`
	ReviewCount int       `json:"review_count"`
	AvgRating   float64   `json:"avg_rating"`
	CreatedAt   time.Time `json:"created_at"`
}
```

- [ ] **Step 2: Select and scan the new columns in `List`**

In `be/internal/repository/product.go`, in `List`, update the SELECT, GROUP BY, and scan. The `query` becomes:

```go
	query := `
		SELECT p.id, p.name, p.category, COALESCE(p.image_url,''),
		       COALESCE(p.logo_url,''), COALESCE(p.banner_url,''),
		       COUNT(r.id) as review_count,
		       COALESCE(AVG(r.rating), 0) as avg_rating,
		       COALESCE(p.created_at, NOW())
		FROM products p
		LEFT JOIN reviews r ON p.id = r.product_id
		` + whereClause + `
		GROUP BY p.id, p.name, p.category, p.image_url, p.logo_url, p.banner_url, p.created_at
		ORDER BY ` + orderBy + `
		LIMIT ? OFFSET ?`
```

And update the scan + absURL block inside the `for rows.Next()` loop:

```go
		var p models.Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.ImageURL,
			&p.LogoURL, &p.BannerURL,
			&p.ReviewCount, &p.AvgRating, &p.CreatedAt); err != nil {
			return nil, 0, err
		}
		p.ImageURL = absURL(r.baseURL, p.ImageURL)
		p.LogoURL = absURL(r.baseURL, p.LogoURL)
		p.BannerURL = absURL(r.baseURL, p.BannerURL)
		products = append(products, &p)
```

- [ ] **Step 3: Select and scan the new columns in `FindByID`**

In the same file, update `FindByID`:

```go
	err := r.db.QueryRowContext(ctx, `
		SELECT p.id, p.name, p.category, COALESCE(p.image_url,''),
		       COALESCE(p.logo_url,''), COALESCE(p.banner_url,''),
		       COUNT(r.id), COALESCE(AVG(r.rating), 0), COALESCE(p.created_at, NOW())
		FROM products p
		LEFT JOIN reviews r ON p.id = r.product_id
		WHERE p.id = ?
		GROUP BY p.id, p.name, p.category, p.image_url, p.logo_url, p.banner_url, p.created_at`, id,
	).Scan(&p.ID, &p.Name, &p.Category, &p.ImageURL, &p.LogoURL, &p.BannerURL,
		&p.ReviewCount, &p.AvgRating, &p.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	p.ImageURL = absURL(r.baseURL, p.ImageURL)
	p.LogoURL = absURL(r.baseURL, p.LogoURL)
	p.BannerURL = absURL(r.baseURL, p.BannerURL)
	return &p, err
```

- [ ] **Step 4: Build and verify the API returns the fields**

```bash
docker compose up -d --build api db
curl -s http://localhost:8080/api/v1/products?limit=1 | head -c 400
```

Expected: JSON containing `"logo_url"` and `"banner_url"` keys (empty strings for seeded products). No build errors.

- [ ] **Step 5: Commit**

```bash
git add be/internal/models/models.go be/internal/repository/product.go
git commit -m "feat(be): expose product logo_url and banner_url"
```

---

## Task 3: Storage subdir support and safe subfolder deletion

**Files:**
- Modify: `be/internal/storage/storage.go:11-24` (interface)
- Modify: `be/internal/storage/local.go` (`Store` ~lines 32-75, `Delete` ~lines 89-98)
- Create: `be/internal/storage/local_test.go`

**Interfaces:**
- Produces: `Storage.Store(ctx, r io.Reader, originalFilename, subdir string, maxBytes int64) (string, error)` — writes to `uploads/<subdir>/<file>` when `subdir != ""`, else `uploads/<file>`. `Delete` removes files in subfolders and rejects path traversal.

- [ ] **Step 1: Write failing tests for subdir store and safe delete**

Create `be/internal/storage/local_test.go`:

```go
package storage

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// a minimal 1x1 PNG so DetectContentType sees "image/png".
var pngBytes = []byte{
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
	0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
	0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
	0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
	0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
	0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
}

func TestStoreWithSubdir(t *testing.T) {
	dir := t.TempDir()
	s := NewLocal(dir, "http://x")

	path, err := s.Store(context.Background(), strings.NewReader(string(pngBytes)), "logo.png", "logos", 1<<20)
	if err != nil {
		t.Fatalf("store failed: %v", err)
	}
	if !strings.HasPrefix(path, "uploads/logos/") {
		t.Fatalf("expected uploads/logos/ prefix, got %q", path)
	}
	if _, err := os.Stat(filepath.Join(dir, "logos", filepath.Base(path))); err != nil {
		t.Fatalf("file not written to subdir: %v", err)
	}
}

func TestStoreWithoutSubdir(t *testing.T) {
	dir := t.TempDir()
	s := NewLocal(dir, "http://x")

	path, err := s.Store(context.Background(), strings.NewReader(string(pngBytes)), "a.png", "", 1<<20)
	if err != nil {
		t.Fatalf("store failed: %v", err)
	}
	if !strings.HasPrefix(path, "uploads/") || strings.Count(path, "/") != 1 {
		t.Fatalf("expected top-level uploads/ path, got %q", path)
	}
}

func TestDeleteSubdirFile(t *testing.T) {
	dir := t.TempDir()
	s := NewLocal(dir, "http://x")

	path, _ := s.Store(context.Background(), strings.NewReader(string(pngBytes)), "b.png", "banners", 1<<20)
	if err := s.Delete(context.Background(), path); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, filepath.Base(path))); !os.IsNotExist(err) {
		// the file must be gone from the subdir
	}
	if _, err := os.Stat(filepath.Join(dir, "banners", filepath.Base(path))); !os.IsNotExist(err) {
		t.Fatalf("subdir file still present after delete")
	}
}

func TestDeleteRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	secret := filepath.Join(dir, "..", "secret.txt")
	if err := os.WriteFile(secret, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(secret)

	s := NewLocal(dir, "http://x")
	// Traversal attempt must not delete the outside file.
	_ = s.Delete(context.Background(), "uploads/../../secret.txt")
	if _, err := os.Stat(secret); err != nil {
		t.Fatalf("traversal delete escaped upload dir: %v", err)
	}
}

func TestDeleteIgnoresEmptyAndHTTP(t *testing.T) {
	s := NewLocal(t.TempDir(), "http://x")
	if err := s.Delete(context.Background(), ""); err != nil {
		t.Fatalf("empty path should be no-op: %v", err)
	}
	if err := s.Delete(context.Background(), "https://cdn.example.com/x.png"); err != nil {
		t.Fatalf("http path should be no-op: %v", err)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail to compile**

```bash
docker compose run --rm api go test ./internal/storage/...
```

Expected: FAIL — compile error because `Store` currently takes 4 args, not 5 (`too many arguments in call to s.Store`). (If the `api` service has no Go toolchain in its runtime image, use the build stage: `docker build --target build -t br-build be && docker run --rm -v "$PWD/be":/src -w /src br-build go test ./internal/storage/...`. Pick whichever runs `go test` against the module.)

- [ ] **Step 3: Update the Storage interface**

In `be/internal/storage/storage.go`, change the `Store` method in the interface:

```go
	// Store validates and saves image data from r into an optional subdir under
	// the upload root, returning a relative path suitable for storing in the
	// database (e.g. "uploads/logos/abc.jpg"). An empty subdir stores at the
	// upload root ("uploads/abc.jpg").
	Store(ctx context.Context, r io.Reader, originalFilename, subdir string, maxBytes int64) (string, error)
```

- [ ] **Step 4: Update `LocalStorage.Store` to write into the subdir**

In `be/internal/storage/local.go`, change the `Store` signature and the path-building section. Replace the signature line and the filename/path block:

```go
func (s *LocalStorage) Store(_ context.Context, r io.Reader, originalFilename, subdir string, maxBytes int64) (string, error) {
```

Then, after computing `ext` (replacing the current `filename`/`fullPath`/`os.Create` lines up to `dst, err := os.Create(fullPath)`):

```go
	b := make([]byte, 12)
	rand.Read(b)
	filename := hex.EncodeToString(b) + ext

	// Confine subdir to a single clean path segment under uploadDir.
	subdir = filepath.Clean("/" + subdir) // e.g. "/logos", "/" for empty
	subdir = strings.TrimPrefix(subdir, "/")

	destDir := s.uploadDir
	relPrefix := "uploads/"
	if subdir != "" {
		destDir = filepath.Join(s.uploadDir, subdir)
		if err := os.MkdirAll(destDir, 0o755); err != nil {
			return "", fmt.Errorf("could not create upload subdir: %w", err)
		}
		relPrefix = "uploads/" + subdir + "/"
	}
	fullPath := filepath.Join(destDir, filename)

	dst, err := os.Create(fullPath)
```

And change the final return of `Store` from `return "uploads/" + filename, nil` to:

```go
	return relPrefix + filename, nil
```

- [ ] **Step 5: Update `LocalStorage.Delete` to handle subfolders safely**

In `be/internal/storage/local.go`, replace the body of `Delete`:

```go
func (s *LocalStorage) Delete(_ context.Context, path string) error {
	if path == "" || strings.HasPrefix(path, "http") {
		return nil
	}
	// Stored paths look like "uploads/<...>/<file>". Strip the leading
	// "uploads/" segment, then clean and confine within uploadDir.
	rel := strings.TrimPrefix(path, "uploads/")
	rel = filepath.Clean("/" + rel)          // absolute-clean removes ".." segments
	rel = strings.TrimPrefix(rel, "/")
	full := filepath.Join(s.uploadDir, rel)

	// Ensure the resolved path is still inside uploadDir.
	root, _ := filepath.Abs(s.uploadDir)
	abs, _ := filepath.Abs(full)
	if abs != root && !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return nil
	}
	if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
```

- [ ] **Step 6: Run the storage tests to verify they pass**

```bash
docker compose run --rm api go test ./internal/storage/... -v
```

Expected: PASS for `TestStoreWithSubdir`, `TestStoreWithoutSubdir`, `TestDeleteSubdirFile`, `TestDeleteRejectsTraversal`, `TestDeleteIgnoresEmptyAndHTTP`.

- [ ] **Step 7: Fix the existing `Store` caller so the module compiles**

The upload handler calls `Store` with the old arity. In `be/internal/handlers/upload.go`, update the call temporarily to pass an empty subdir (Task 4 replaces this with the validated folder):

```go
	path, err := h.storage.Store(r.Context(), file, header.Filename, "", 10<<20)
```

Then confirm the whole module builds:

```bash
docker compose build api
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add be/internal/storage/storage.go be/internal/storage/local.go be/internal/storage/local_test.go be/internal/handlers/upload.go
git commit -m "feat(be): support upload subfolders and safe subfolder deletion"
```

---

## Task 4: Upload endpoint routes files by validated folder

**Files:**
- Modify: `be/internal/handlers/upload.go`

**Interfaces:**
- Consumes: `Storage.Store(ctx, r, filename, subdir, maxBytes)` from Task 3.
- Produces: `POST /upload/image` and `POST /admin/upload/image` accept an optional `folder` form field ∈ {`logos`, `banners`, `""`}; unknown values → 400.

- [ ] **Step 1: Add folder validation to the upload handler**

In `be/internal/handlers/upload.go`, replace the `Image` method body's store call region. After `defer file.Close()`, add folder resolution and pass it to `Store`:

```go
	folder := r.FormValue("folder")
	subdir, ok := map[string]string{
		"":        "",
		"logos":   "logos",
		"banners": "banners",
	}[folder]
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid folder")
		return
	}

	path, err := h.storage.Store(r.Context(), file, header.Filename, subdir, 10<<20)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": h.storage.URL(path)})
```

(Remove the old `path, err := h.storage.Store(... "", ...)` line added in Task 3 so there is exactly one `Store` call.)

- [ ] **Step 2: Build and verify folder routing with curl**

Obtain an auth token (register/login via the existing auth endpoints — see `be/CURL_EXAMPLES.md`), then:

```bash
docker compose up -d --build api
TOKEN=... # bearer token for any authenticated user
# valid folder
curl -s -H "Authorization: Bearer $TOKEN" -F "file=@some.png" -F "folder=logos" \
  http://localhost:8080/api/v1/upload/image
# invalid folder
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  -F "file=@some.png" -F "folder=nope" http://localhost:8080/api/v1/upload/image
```

Expected: first returns `{"url":"http://localhost:8080/uploads/logos/<hex>.png"}`; second prints `400`. Confirm the file exists: `docker compose exec api ls uploads/logos`.

- [ ] **Step 3: Commit**

```bash
git add be/internal/handlers/upload.go
git commit -m "feat(be): route uploads into logos/banners subfolders via folder field"
```

---

## Task 5: Admin create/update products with logo and banner

**Files:**
- Modify: `be/internal/handlers/admin.go:641-686` (`CreateProduct`, `UpdateProduct`)

**Interfaces:**
- Consumes: `products.logo_url`, `products.banner_url` columns.
- Produces: `POST /admin/products` and `PATCH /admin/products/{id}` accept `logo_url`, `banner_url`.

- [ ] **Step 1: Extend `CreateProduct`**

In `be/internal/handlers/admin.go`, update `CreateProduct`'s body struct and INSERT:

```go
	var body struct {
		Name      string `json:"name"`
		Category  string `json:"category"`
		ImageURL  string `json:"image_url"`
		LogoURL   string `json:"logo_url"`
		BannerURL string `json:"banner_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.Category == "" {
		writeError(w, http.StatusBadRequest, "name and category are required")
		return
	}
	res, err := h.db.ExecContext(r.Context(),
		`INSERT INTO products (name, category, image_url, logo_url, banner_url)
		 VALUES (?, ?, NULLIF(?, ''), NULLIF(?, ''), NULLIF(?, ''))`,
		body.Name, body.Category, body.ImageURL, body.LogoURL, body.BannerURL)
```

- [ ] **Step 2: Extend `UpdateProduct`**

Update `UpdateProduct`'s body struct and UPDATE:

```go
	var body struct {
		Name      *string `json:"name"`
		Category  *string `json:"category"`
		ImageURL  *string `json:"image_url"`
		LogoURL   *string `json:"logo_url"`
		BannerURL *string `json:"banner_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	h.db.ExecContext(r.Context(), `
		UPDATE products SET
		  name       = COALESCE(?, name),
		  category   = COALESCE(?, category),
		  image_url  = COALESCE(?, image_url),
		  logo_url   = COALESCE(?, logo_url),
		  banner_url = COALESCE(?, banner_url)
		WHERE id = ?`, body.Name, body.Category, body.ImageURL, body.LogoURL, body.BannerURL, id)
```

- [ ] **Step 3: Build and verify with curl**

```bash
docker compose up -d --build api
ADMIN=... # admin bearer token
curl -s -X PATCH -H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json" \
  -d '{"logo_url":"uploads/logos/test.png","banner_url":"uploads/banners/test.png"}' \
  http://localhost:8080/api/v1/admin/products/1
curl -s http://localhost:8080/api/v1/products/1 | head -c 400
```

Expected: `GET /products/1` shows `logo_url` and `banner_url` populated (as absolute URLs).

- [ ] **Step 4: Commit**

```bash
git add be/internal/handlers/admin.go
git commit -m "feat(be): admin create/update products with logo and banner"
```

---

## Task 6: Owner endpoint to update own product's logo/banner

**Files:**
- Modify: `be/internal/repository/product.go` (add `UpdateBrandAssets`)
- Modify: `be/internal/handlers/profile.go:110-136` (`MyProducts`), and add `UpdateProduct` (owner)
- Modify: `be/internal/router/router.go:160` (register route)

**Interfaces:**
- Consumes: `products.OwnedBy(ctx, productID, userID) bool` (exists), `users.IsVerifiedOwner(ctx, userID) bool` (exists), `products.FindByID`.
- Produces: `ProductRepo.UpdateBrandAssets(ctx, productID, ownerID int64, logo, banner *string) error`; `PATCH /profile/products/{id}` (auth group); `MyProducts` JSON items gain `logo_url`, `banner_url`.

- [ ] **Step 1: Add `UpdateBrandAssets` to ProductRepo**

In `be/internal/repository/product.go`, add:

```go
// UpdateBrandAssets sets logo_url/banner_url for a product owned by ownerID.
// nil pointers leave the corresponding column unchanged. Returns ErrNotFound
// if the product does not exist or is not owned by ownerID.
func (r *ProductRepo) UpdateBrandAssets(ctx context.Context, productID, ownerID int64, logo, banner *string) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE products SET
		  logo_url   = COALESCE(?, logo_url),
		  banner_url = COALESCE(?, banner_url)
		WHERE id = ? AND owner_id = ?`, logo, banner, productID, ownerID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		// Distinguish "not owned/absent" from "no-op update" via an ownership check.
		if !r.OwnedBy(ctx, productID, ownerID) {
			return ErrNotFound
		}
	}
	return nil
}
```

- [ ] **Step 2: Add `products` and `storage` to `ProfileHandler`**

`ProfileHandler` currently holds only `users *repository.UserRepo` and `db *sql.DB`. The owner update needs the product repo, and `MyProducts` needs to build absolute URLs. In `be/internal/handlers/profile.go`, update the struct, constructor, and imports:

```go
import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"final-review/be/internal/storage"
	"github.com/go-chi/chi/v5"
)

type ProfileHandler struct {
	users    *repository.UserRepo
	products *repository.ProductRepo
	storage  storage.Storage
	db       *sql.DB
}

func NewProfileHandler(users *repository.UserRepo, products *repository.ProductRepo, store storage.Storage, db *sql.DB) *ProfileHandler {
	return &ProfileHandler{users: users, products: products, storage: store, db: db}
}
```

Then update the constructor call in `be/internal/router/router.go` (currently `profileH := handlers.NewProfileHandler(userRepo, db)`):

```go
	profileH  := handlers.NewProfileHandler(userRepo, productRepo, store, db)
```

- [ ] **Step 3: Include logo/banner in `MyProducts`**

In `be/internal/handlers/profile.go`, update the `MyProducts` query, the local `product` struct, and the scan:

```go
	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, name, category, COALESCE(logo_url,''), COALESCE(banner_url,'')
		 FROM products WHERE owner_id = ? ORDER BY name ASC`, userID)
```

```go
	type product struct {
		ID        int64  `json:"id"`
		Name      string `json:"name"`
		Category  string `json:"category"`
		LogoURL   string `json:"logo_url"`
		BannerURL string `json:"banner_url"`
	}
	var list []product
	for rows.Next() {
		var p product
		rows.Scan(&p.ID, &p.Name, &p.Category, &p.LogoURL, &p.BannerURL)
		p.LogoURL = h.storage.URL(p.LogoURL)
		p.BannerURL = h.storage.URL(p.BannerURL)
		list = append(list, p)
	}
```

- [ ] **Step 4: Add the owner `UpdateProduct` handler**

In `be/internal/handlers/profile.go`, add (the `chi`, `strconv`, and `storage` imports were added in Step 2):

```go
// UpdateProduct handles PATCH /profile/products/{id} — a verified owner sets
// only the logo_url/banner_url of a product they own.
func (h *ProfileHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if !h.users.IsVerifiedOwner(r.Context(), userID) {
		writeError(w, http.StatusForbidden, "account pending verification")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		LogoURL   *string `json:"logo_url"`
		BannerURL *string `json:"banner_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if err := h.products.UpdateBrandAssets(r.Context(), id, userID, body.LogoURL, body.BannerURL); err == repository.ErrNotFound {
		writeError(w, http.StatusForbidden, "product not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update product")
		return
	}
	p, _ := h.products.FindByID(r.Context(), id)
	writeJSON(w, http.StatusOK, p)
}
```

(`h.users`, `h.products` were wired up in Step 2; `profile.go` already uses `middleware.UserIDFromCtx`.)

- [ ] **Step 5: Register the route**

In `be/internal/router/router.go`, in the authenticated group (right after line 160 `r.Get("/profile/products", profileH.MyProducts)`), add:

```go
			r.Patch("/profile/products/{id}", profileH.UpdateProduct)
```

- [ ] **Step 6: Build and verify ownership guard with curl**

```bash
docker compose up -d --build api
OWNER=...      # verified owner's token, owns product OWNED_ID
OWNED_ID=...
OTHER_ID=...   # a product NOT owned by this owner
# success
curl -s -X PATCH -H "Authorization: Bearer $OWNER" -H "Content-Type: application/json" \
  -d '{"logo_url":"uploads/logos/x.png"}' http://localhost:8080/api/v1/profile/products/$OWNED_ID | head -c 200
# forbidden (not owned)
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "Authorization: Bearer $OWNER" \
  -H "Content-Type: application/json" -d '{"logo_url":"uploads/logos/x.png"}' \
  http://localhost:8080/api/v1/profile/products/$OTHER_ID
```

Expected: first returns the updated product JSON with `logo_url` set; second prints `403`.

- [ ] **Step 7: Commit**

```bash
git add be/internal/repository/product.go be/internal/handlers/profile.go be/internal/router/router.go
git commit -m "feat(be): owner endpoint to update own product logo/banner"
```

---

## Task 7: Frontend API types for logo/banner

**Files:**
- Modify: `fe/src/lib/api.ts:12-20` (`ApiProduct`), `:87-91` (`ApiOwnerProduct`)

**Interfaces:**
- Produces: `ApiProduct.logo_url: string`, `ApiProduct.banner_url: string`; `ApiOwnerProduct.logo_url?: string`, `ApiOwnerProduct.banner_url?: string`.

- [ ] **Step 1: Add fields to `ApiProduct`**

In `fe/src/lib/api.ts`:

```ts
export interface ApiProduct {
  id: number;
  name: string;
  category: string;
  image_url: string;
  logo_url: string;
  banner_url: string;
  review_count: number;
  avg_rating: number;
  created_at: string;
}
```

- [ ] **Step 2: Add fields to `ApiOwnerProduct`**

```ts
export interface ApiOwnerProduct {
  id: number;
  name: string;
  category: string;
  logo_url?: string;
  banner_url?: string;
}
```

- [ ] **Step 3: Verify the app still type-checks/builds**

```bash
cd fe && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add fe/src/lib/api.ts
git commit -m "feat(fe): add logo_url/banner_url to product API types"
```

---

## Task 8: Shared ProductLogo component

**Files:**
- Create: `fe/src/components/ProductLogo.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; lucide icons `Package`, `Monitor`, `Briefcase`.
- Produces: `export function ProductLogo(props: { logoUrl?: string; category: string; name: string; className?: string })` — renders a fitted logo or a styled category placeholder; fills its container (`absolute inset-0` friendly / `w-full h-full`).

- [ ] **Step 1: Create the component**

Create `fe/src/components/ProductLogo.tsx`:

```tsx
import { Package, Monitor, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

const categoryStyle = (category: string) => {
  switch (category) {
    case "digital":
      return { Icon: Monitor, tint: "from-sky-500/15 to-sky-500/5 text-sky-600" };
    case "service":
      return { Icon: Briefcase, tint: "from-violet-500/15 to-violet-500/5 text-violet-600" };
    default: // physical
      return { Icon: Package, tint: "from-amber-500/15 to-amber-500/5 text-amber-600" };
  }
};

interface ProductLogoProps {
  logoUrl?: string;
  category: string;
  name: string;
  className?: string;
}

export function ProductLogo({ logoUrl, category, name, className }: ProductLogoProps) {
  const { Icon, tint } = categoryStyle(category);

  if (logoUrl) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/40 p-6", className)}>
        <img
          src={logoUrl}
          alt={name}
          loading="lazy"
          className="max-h-full max-w-full object-contain transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 bg-gradient-to-br p-4 text-center",
        tint,
        className
      )}
    >
      <Icon className="h-10 w-10 opacity-80" />
      <span className="line-clamp-2 px-2 text-sm font-medium text-foreground/70">{name}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd fe && npm run build
```

Expected: build succeeds (component compiles even though not yet used — if the linter flags an unused export, it will be used in Task 9).

- [ ] **Step 3: Commit**

```bash
git add fe/src/components/ProductLogo.tsx
git commit -m "feat(fe): add shared ProductLogo component with category placeholder"
```

---

## Task 9: Home-page cards use ProductLogo

**Files:**
- Modify: `fe/src/components/ReviewedProducts.tsx`
- Modify: `fe/src/components/ReviewedProductsGrid.tsx`

**Interfaces:**
- Consumes: `ProductLogo` from Task 8; `ApiProduct.logo_url` from Task 7.

- [ ] **Step 1: Update `ReviewedProducts.tsx`**

Replace the image import/icon logic. Remove the `categoryIcon` helper and the `Package, Briefcase, Monitor` imports from lucide (keep `Star`). Add `import { ProductLogo } from "@/components/ProductLogo";`. Replace the image block inside the card:

```tsx
            <div className="aspect-[4/3] overflow-hidden">
              <ProductLogo
                logoUrl={product.logo_url}
                category={product.category}
                name={product.name}
                className="h-full w-full"
              />
            </div>
```

(Delete the old `{product.image_url ? <img…/> : <Icon…/>}` block and the `const Icon = categoryIcon(product.category);` line.)

- [ ] **Step 2: Update `ReviewedProductsGrid.tsx`**

Apply the same change: remove `categoryIcon` + unused lucide icon imports (keep `Star`), import `ProductLogo`, and replace the image block:

```tsx
            <div className="aspect-[4/3] overflow-hidden">
              <ProductLogo
                logoUrl={product.logo_url}
                category={product.category}
                name={product.name}
                className="h-full w-full"
              />
            </div>
```

- [ ] **Step 3: Build and manually verify**

```bash
cd fe && npm run build && npm run dev
```

Open `http://localhost:8080/`. Expected: the "Products reviewed" and "Top reviewed" sections show fitted logos where a product has `logo_url`, and a category-tinted placeholder (icon + name) where it does not — no cropped photos.

- [ ] **Step 4: Commit**

```bash
git add fe/src/components/ReviewedProducts.tsx fe/src/components/ReviewedProductsGrid.tsx
git commit -m "feat(fe): show product logo with category placeholder on home cards"
```

---

## Task 10: Product-detail banner hero

**Files:**
- Modify: `fe/src/pages/ProductReviews.tsx:132-165`

**Interfaces:**
- Consumes: `ApiProduct.banner_url`, `ApiProduct.logo_url` from the `GET /products/{id}` query already in this page; `ProductLogo` from Task 8.

- [ ] **Step 1: Turn the product header into a banner hero**

In `fe/src/pages/ProductReviews.tsx`, import `ProductLogo` (`import { ProductLogo } from "@/components/ProductLogo";`) and replace the `{/* Product header */}` `<section>` (the `bg-card border … p-6 md:p-8 mb-8` block) with a hero that layers a banner background, a scrim, and the existing content:

```tsx
        {/* Product hero */}
        <section className="relative mb-8 overflow-hidden rounded-xl border border-border shadow-soft">
          <div className="absolute inset-0">
            {product.banner_url ? (
              <img
                src={product.banner_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ProductLogo
                logoUrl={undefined}
                category={product.category}
                name={product.name}
                className="h-full w-full"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/60 to-background/20" />
          </div>

          <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between md:p-8">
            <div className="flex items-end gap-4">
              {product.logo_url && (
                <div className="hidden h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-2 shadow-soft sm:flex">
                  <img src={product.logo_url} alt={product.name} className="max-h-full max-w-full object-contain" />
                </div>
              )}
              <div>
                <Badge variant={product.category as any} className="mb-3">
                  {toLabel(product.category)}
                </Badge>
                <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
                  {product.name}
                </h1>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${
                          i < Math.round(product.avg_rating) ? "fill-gold text-gold" : "text-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-semibold text-foreground">{product.avg_rating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">
                    ({t("product.review", { count: product.review_count })})
                  </span>
                </div>
              </div>
            </div>

            <Button variant="hero" onClick={() => navigate("/write-review")}>
              <PenSquare className="h-4 w-4 mr-2" />
              {t("product.writeReview")}
            </Button>
          </div>
        </section>
```

Keep all existing imports used here (`Badge`, `Star`, `Button`, `PenSquare`, `toLabel`, `t`, `navigate`).

- [ ] **Step 2: Build and manually verify**

```bash
cd fe && npm run build && npm run dev
```

Open a product with a banner (`/product/:id`) and one without. Expected: banner shows as the hero background with legible overlaid text and a logo badge; a product without a banner shows the category placeholder as the hero. Rating, badge, and "Write review" button still work.

- [ ] **Step 3: Commit**

```bash
git add fe/src/pages/ProductReviews.tsx
git commit -m "feat(fe): banner hero on product detail page"
```

---

## Task 11: Owner dashboard brand-assets upload panel

**Files:**
- Modify: `fe/src/pages/OwnerDashboard.tsx`

**Interfaces:**
- Consumes: `ApiOwnerProduct.logo_url/banner_url` from Task 7; `POST /upload/image` (folder field) from Task 4; `PATCH /profile/products/{id}` from Task 6; `apiFetch`, `useQueryClient`, `useToast`.

- [ ] **Step 1: Add an upload helper and the panel**

In `fe/src/pages/OwnerDashboard.tsx`, add imports as needed (`useQueryClient` from `@tanstack/react-query`, `useToast` from `@/components/ui/use-toast` or the project's toast hook, and a `useRef`/`useState` for file handling). Add an inline upload helper near the component top:

```tsx
async function uploadTo(folder: "logos" | "banners", file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  const { url } = await apiFetch<{ url: string }>("/upload/image", { method: "POST", body: fd });
  return url;
}
```

Inside the component (verified owners only), after the product `<Select>`, render a panel for the selected product when a specific product is chosen (`selectedProduct !== "all"`). Use the `queryClient` to refetch `owner-products` after save:

```tsx
const queryClient = useQueryClient();
const { toast } = useToast();
const current = products.find((p) => String(p.id) === selectedProduct);

async function handleAssetUpload(folder: "logos" | "banners", file: File) {
  if (!current) return;
  try {
    const url = await uploadTo(folder, file);
    await apiFetch(`/profile/products/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify(folder === "logos" ? { logo_url: url } : { banner_url: url }),
    });
    await queryClient.invalidateQueries({ queryKey: ["owner-products"] });
    toast({ title: t("owner.assetsSaved", "Saved") });
  } catch (e: any) {
    toast({ title: t("owner.assetsError", "Upload failed"), description: e.message, variant: "destructive" });
  }
}
```

Panel JSX (render when `user.owner_verified && current`):

```tsx
{user.owner_verified && current && (
  <div className="mb-6 rounded-xl border border-border bg-card p-4">
    <h3 className="mb-3 font-serif font-semibold">{t("owner.brandAssets", "Brand assets")}</h3>
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">{t("owner.logo", "Logo")}</span>
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {current.logo_url ? (
            <img src={current.logo_url} alt="logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">{t("owner.none", "None")}</span>
          )}
        </div>
        <input type="file" accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleAssetUpload("logos", e.target.files[0])} />
      </div>
      <div className="space-y-2">
        <span className="text-sm text-muted-foreground">{t("owner.banner", "Banner")}</span>
        <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
          {current.banner_url ? (
            <img src={current.banner_url} alt="banner" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-muted-foreground">{t("owner.none", "None")}</span>
          )}
        </div>
        <input type="file" accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleAssetUpload("banners", e.target.files[0])} />
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Build and manually verify**

```bash
cd fe && npm run build && npm run dev
```

Log in as a verified owner, open the dashboard, select one of your products, upload a logo and a banner. Expected: previews update after upload; reloading the page shows the persisted assets; the product's home-page card and detail hero now reflect them.

- [ ] **Step 3: Commit**

```bash
git add fe/src/pages/OwnerDashboard.tsx
git commit -m "feat(fe): owner dashboard brand-assets upload panel"
```

---

## Task 12: CMS logo/banner upload fields

**Files:**
- Modify: `cms/src/lib/api.ts:53-60` (`AdminProduct`), `:119-127` (`uploadImage`)
- Modify: `cms/src/pages/Products.tsx`

**Interfaces:**
- Consumes: `POST /admin/upload/image` (folder field); `PATCH`/`POST /admin/products` (logo_url/banner_url) from Task 5.
- Produces: `uploadImage(file: File, folder?: string): Promise<string>`; `AdminProduct.logo_url/banner_url`.

- [ ] **Step 1: Extend `AdminProduct` and `uploadImage`**

In `cms/src/lib/api.ts`, add to `AdminProduct`:

```ts
  logo_url: string;
  banner_url: string;
```

And update `uploadImage`:

```ts
export async function uploadImage(file: File, folder?: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  if (folder) fd.append("folder", folder);
  const data = await apiFetch<{ url: string }>("/admin/upload/image", {
    method: "POST",
    body: fd,
  });
  return data.url;
}
```

- [ ] **Step 2: Add logo/banner fields to the product dialog**

In `cms/src/pages/Products.tsx`:
- Import `uploadImage`: `import { apiFetch, uploadImage, type AdminProduct, type AdminCategory } from "@/lib/api";`
- Extend `ProductForm`: `type ProductForm = { name: string; category: string; image_url: string; logo_url: string; banner_url: string };`
- Update `openCreate` and `openEdit` to include the new fields:

```tsx
  const openCreate = () => { setForm({ name: "", category: categories[0]?.slug ?? "", image_url: "", logo_url: "", banner_url: "" }); setDialog({ mode: "create" }); };
  const openEdit = (p: AdminProduct) => { setForm({ name: p.name, category: p.category, image_url: p.image_url || "", logo_url: p.logo_url || "", banner_url: p.banner_url || "" }); setDialog({ mode: "edit", product: p }); };
```

- After the existing "Image URL" field block in the dialog, add logo and banner upload fields:

```tsx
            <div className="space-y-1.5">
              <Label>Logo <span className="text-muted-foreground text-xs">(shown on home page)</span></Label>
              {form.logo_url && <img src={form.logo_url} alt="logo" className="h-16 w-16 object-contain rounded border border-border" />}
              <Input type="file" accept="image/*" onChange={async e => {
                const file = e.target.files?.[0];
                if (file) setForm(f => ({ ...f, logo_url: await uploadImage(file, "logos") }));
              }} />
            </div>
            <div className="space-y-1.5">
              <Label>Banner <span className="text-muted-foreground text-xs">(product page hero)</span></Label>
              {form.banner_url && <img src={form.banner_url} alt="banner" className="h-20 w-full object-cover rounded border border-border" />}
              <Input type="file" accept="image/*" onChange={async e => {
                const file = e.target.files?.[0];
                if (file) setForm(f => ({ ...f, banner_url: await uploadImage(file, "banners") }));
              }} />
            </div>
```

(The existing create/edit mutations already send the whole `form`, so `logo_url`/`banner_url` flow through automatically. Verify the mutation bodies serialize `form` — if they pick specific fields, add `logo_url`/`banner_url` there.)

- [ ] **Step 3: Build and manually verify**

```bash
cd cms && npm run build && npm run dev
```

Open the CMS Products page, create/edit a product, upload a logo and banner. Expected: previews render; on save the product persists; the public home card and detail hero reflect the new assets; files land under `uploads/logos/` and `uploads/banners/` on the server.

- [ ] **Step 4: Commit**

```bash
git add cms/src/lib/api.ts cms/src/pages/Products.tsx
git commit -m "feat(cms): upload product logo and banner"
```

---

## Final verification

- [ ] **Backend builds and storage tests pass:** `docker compose build api && docker compose run --rm api go test ./internal/storage/...`
- [ ] **Frontend builds:** `cd fe && npm run build`
- [ ] **CMS builds:** `cd cms && npm run build`
- [ ] **End-to-end:** As admin (CMS) and as a verified owner (FE), upload a logo + banner for a product; confirm the home cards show the fitted logo / placeholder, the detail page shows the banner hero, and the files are stored under `uploads/logos/` and `uploads/banners/`.
