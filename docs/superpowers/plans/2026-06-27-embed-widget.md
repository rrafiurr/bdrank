# Embeddable Review Badge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product owners can embed a BdRanks review badge on external websites; the badge is product-specific, domain-locked, and admin-approval-gated.

**Architecture:** New `embed_tokens` DB table; `EmbedRepo` for data access; public `/api/v1/widget/{token}` JSON endpoint (wildcard CORS); vanilla `widget.js` + React `EmbedPage` for the two embed formats; owner dashboard page to request/view codes; CMS page for admin approve/revoke.

**Tech Stack:** Go (Chi, database/sql, MySQL), React 18 + TypeScript + Vite, shadcn/ui, TanStack React Query, vanilla JS (widget.js)

## Global Constraints

- Go module path: `final-review/be`
- All existing Go packages: `handlers`, `repository`, `middleware`, `models`, `config`, `storage`, `router` — do not rename
- No new Go dependencies — stdlib only (`crypto/rand`, `net/url`, `encoding/hex`, `fmt`, `strings`, etc.)
- No new npm packages — all UI uses existing shadcn/ui components already in `fe/` and `cms/`
- Domain stored as bare lowercase hostname (no scheme, no path, no port) e.g. `mybrand.com`
- `www.mybrand.com` and `mybrand.com` are treated as the same domain (strip `www.` before comparing)
- Token: 48 hex chars (24 random bytes → `hex.EncodeToString`)
- Widget endpoint path: `GET /api/v1/widget/{token}` — note curly braces, Chi URL param syntax
- iframe FE route: `/embed/:token`
- Owner embed page FE route: `/owner-embed`
- CMS embeds page route: `/embeds`
- `cfg.SiteURL` (e.g. `https://bdranks.com`) is used as the base for product URLs in widget JSON
- All new FE pages follow the existing pattern: `PageHead` + `Header` + `main` + `Footer`
- The EmbedPage (`/embed/:token`) renders WITHOUT Header/Footer — it is loaded in an iframe
- `widget.js` is a static file in `fe/public/` — pure vanilla JS, no bundler, no imports
- CORS for widget endpoint: `Access-Control-Allow-Origin: *` (only that path; all others keep existing configured CORS)
- Missing `Origin`/`Referer` header on widget requests is allowed (enables direct curl testing)
- 401 from the API is intercepted globally by the FE and redirects to `/auth` — the widget handler must NOT return 401; use 403 for all authorization failures
- No i18n required for the new owner embed page or embed badge (English only is acceptable for this feature)

---

### Task 1: DB Migration + Embed Repository

**Files:**
- Create: `be/migrations/008_embed_tokens.sql`
- Create: `be/internal/repository/embed.go`

**Interfaces:**
- Produces:
  - `repository.EmbedToken` struct
  - `repository.WidgetData`, `WidgetProduct`, `WidgetReview`, `WidgetConfig` structs
  - `repository.CreateEmbedReq` struct
  - `repository.EmbedRepo` with methods:
    - `NewEmbedRepo(db *sql.DB, siteURL string) *EmbedRepo`
    - `Create(ctx context.Context, req CreateEmbedReq) (*EmbedToken, error)`
    - `ListByOwner(ctx context.Context, ownerID int64) ([]*EmbedToken, error)`
    - `FindByToken(ctx context.Context, token string) (*EmbedToken, error)`
    - `ListAll(ctx context.Context, status string) ([]*EmbedToken, error)`
    - `UpdateStatus(ctx context.Context, id int64, status, adminNote string) error`
    - `GetWidgetData(ctx context.Context, tok *EmbedToken) (*WidgetData, error)`

- [ ] **Step 1: Write the migration file**

Create `be/migrations/008_embed_tokens.sql`:

```sql
CREATE TABLE IF NOT EXISTS embed_tokens (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
    token          VARCHAR(64)  NOT NULL UNIQUE,
    product_id     BIGINT       NOT NULL,
    owner_id       BIGINT       NOT NULL,
    domain         VARCHAR(255) NOT NULL,
    status         ENUM('pending','approved','revoked') NOT NULL DEFAULT 'pending',
    show_rating    TINYINT(1)   NOT NULL DEFAULT 1,
    show_count     TINYINT(1)   NOT NULL DEFAULT 1,
    show_breakdown TINYINT(1)   NOT NULL DEFAULT 0,
    show_snippet   TINYINT(1)   NOT NULL DEFAULT 0,
    admin_note     VARCHAR(500) NOT NULL DEFAULT '',
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at    TIMESTAMP    NULL DEFAULT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Apply migration locally**

```bash
mysql -u root finalreview < be/migrations/008_embed_tokens.sql
```

Expected: no error, table created.

- [ ] **Step 3: Verify table exists**

```bash
mysql -u root finalreview -e "DESCRIBE embed_tokens;"
```

Expected: shows all columns including `token`, `domain`, `status`, `show_rating`, etc.

- [ ] **Step 4: Create the embed repository**

Create `be/internal/repository/embed.go`:

```go
package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

// Note: ApprovedAt uses *time.Time (not sql.NullTime) so it serialises as
// a JSON string or null — sql.NullTime would produce {"Time":…,"Valid":…}.

// EmbedToken is one row from embed_tokens, with joined product/owner names.
// JSON tags use snake_case so the FE receives show_rating etc. (not ShowRating).
type EmbedToken struct {
	ID            int64      `json:"id"`
	Token         string     `json:"token"`
	ProductID     int64      `json:"product_id"`
	OwnerID       int64      `json:"owner_id"`
	Domain        string     `json:"domain"`
	Status        string     `json:"status"`
	ShowRating    bool       `json:"show_rating"`
	ShowCount     bool       `json:"show_count"`
	ShowBreakdown bool       `json:"show_breakdown"`
	ShowSnippet   bool       `json:"show_snippet"`
	AdminNote     string     `json:"admin_note"`
	CreatedAt     time.Time  `json:"created_at"`
	ApprovedAt    *time.Time `json:"approved_at,omitempty"`
	ProductName   string     `json:"product_name"`
	OwnerEmail    string     `json:"owner_email,omitempty"`
	OwnerCompany  string     `json:"owner_company,omitempty"`
}

// WidgetData is the JSON payload returned by GET /api/v1/widget/{token}.
type WidgetData struct {
	Product      WidgetProduct  `json:"product"`
	AvgRating    float64        `json:"avg_rating"`
	ReviewCount  int            `json:"review_count"`
	Breakdown    map[string]int `json:"breakdown"`
	LatestReview *WidgetReview  `json:"latest_review,omitempty"`
	Config       WidgetConfig   `json:"config"`
}

type WidgetProduct struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type WidgetReview struct {
	Title  string `json:"title"`
	Rating int    `json:"rating"`
	Date   string `json:"date"` // "2006-01" format
}

type WidgetConfig struct {
	ShowRating    bool `json:"show_rating"`
	ShowCount     bool `json:"show_count"`
	ShowBreakdown bool `json:"show_breakdown"`
	ShowSnippet   bool `json:"show_snippet"`
}

// CreateEmbedReq holds the fields for creating a new embed token.
type CreateEmbedReq struct {
	ProductID     int64
	OwnerID       int64
	Domain        string
	ShowRating    bool
	ShowCount     bool
	ShowBreakdown bool
	ShowSnippet   bool
}

type EmbedRepo struct {
	db      *sql.DB
	siteURL string // e.g. "https://bdranks.com" — used to build product URLs
}

func NewEmbedRepo(db *sql.DB, siteURL string) *EmbedRepo {
	return &EmbedRepo{db: db, siteURL: siteURL}
}

// Create generates a new token and inserts the embed request as "pending".
func (r *EmbedRepo) Create(ctx context.Context, req CreateEmbedReq) (*EmbedToken, error) {
	b := make([]byte, 24)
	rand.Read(b)
	token := hex.EncodeToString(b)

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO embed_tokens
			(token, product_id, owner_id, domain, show_rating, show_count, show_breakdown, show_snippet)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		token, req.ProductID, req.OwnerID, req.Domain,
		boolInt(req.ShowRating), boolInt(req.ShowCount),
		boolInt(req.ShowBreakdown), boolInt(req.ShowSnippet),
	)
	if err != nil {
		return nil, err
	}
	return r.findByToken(ctx, token)
}

// ListByOwner returns all embed tokens owned by ownerID, newest first.
func (r *EmbedRepo) ListByOwner(ctx context.Context, ownerID int64) ([]*EmbedToken, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.token, e.product_id, e.owner_id, e.domain, e.status,
		       e.show_rating, e.show_count, e.show_breakdown, e.show_snippet,
		       e.admin_note, e.created_at, e.approved_at,
		       p.name AS product_name, '' AS owner_email, '' AS owner_company
		FROM embed_tokens e
		JOIN products p ON p.id = e.product_id
		WHERE e.owner_id = ?
		ORDER BY e.created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEmbedRows(rows)
}

// FindByToken looks up one embed token row by its token string.
func (r *EmbedRepo) FindByToken(ctx context.Context, token string) (*EmbedToken, error) {
	return r.findByToken(ctx, token)
}

// ListAll returns all embed tokens for admin use. Pass status="" for all statuses.
func (r *EmbedRepo) ListAll(ctx context.Context, status string) ([]*EmbedToken, error) {
	q := `
		SELECT e.id, e.token, e.product_id, e.owner_id, e.domain, e.status,
		       e.show_rating, e.show_count, e.show_breakdown, e.show_snippet,
		       e.admin_note, e.created_at, e.approved_at,
		       p.name AS product_name,
		       COALESCE(u.email,'') AS owner_email,
		       COALESCE(u.company_name,'') AS owner_company
		FROM embed_tokens e
		JOIN products p ON p.id = e.product_id
		JOIN users u ON u.id = e.owner_id`
	args := []any{}
	if status != "" {
		q += " WHERE e.status = ?"
		args = append(args, status)
	}
	q += " ORDER BY e.created_at DESC"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEmbedRows(rows)
}

// UpdateStatus sets status and admin_note on an embed token. Sets approved_at when approving.
func (r *EmbedRepo) UpdateStatus(ctx context.Context, id int64, status, adminNote string) error {
	var approvedAt *time.Time
	if status == "approved" {
		now := time.Now()
		approvedAt = &now
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE embed_tokens SET status = ?, admin_note = ?, approved_at = ? WHERE id = ?`,
		status, adminNote, approvedAt, id)
	return err
}

// GetWidgetData queries product summary data for a given approved token.
func (r *EmbedRepo) GetWidgetData(ctx context.Context, tok *EmbedToken) (*WidgetData, error) {
	var productName string
	var avgRating float64
	var reviewCount int
	err := r.db.QueryRowContext(ctx, `
		SELECT p.name, COALESCE(AVG(r.rating), 0), COUNT(r.id)
		FROM products p
		LEFT JOIN reviews r ON r.product_id = p.id AND r.is_approved = 1
		WHERE p.id = ?
		GROUP BY p.name`, tok.ProductID,
	).Scan(&productName, &avgRating, &reviewCount)
	if err != nil {
		return nil, fmt.Errorf("product query: %w", err)
	}

	// Rating breakdown: count per star (1-5)
	breakdown := map[string]int{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
	brows, err := r.db.QueryContext(ctx, `
		SELECT rating, COUNT(*) FROM reviews
		WHERE product_id = ? AND is_approved = 1
		GROUP BY rating`, tok.ProductID)
	if err != nil {
		return nil, fmt.Errorf("breakdown query: %w", err)
	}
	defer brows.Close()
	for brows.Next() {
		var star, count int
		brows.Scan(&star, &count)
		breakdown[fmt.Sprintf("%d", star)] = count
	}

	// Latest review snippet (only when ShowSnippet is on)
	var latestReview *WidgetReview
	if tok.ShowSnippet {
		var title string
		var rating int
		var createdAt time.Time
		err := r.db.QueryRowContext(ctx, `
			SELECT title, rating, COALESCE(created_at, NOW())
			FROM reviews
			WHERE product_id = ? AND is_approved = 1
			ORDER BY created_at DESC LIMIT 1`, tok.ProductID,
		).Scan(&title, &rating, &createdAt)
		if err == nil {
			latestReview = &WidgetReview{
				Title:  title,
				Rating: rating,
				Date:   createdAt.Format("2006-01"),
			}
		}
	}

	return &WidgetData{
		Product: WidgetProduct{
			ID:   tok.ProductID,
			Name: productName,
			URL:  fmt.Sprintf("%s/product/%d", r.siteURL, tok.ProductID),
		},
		AvgRating:    avgRating,
		ReviewCount:  reviewCount,
		Breakdown:    breakdown,
		LatestReview: latestReview,
		Config: WidgetConfig{
			ShowRating:    tok.ShowRating,
			ShowCount:     tok.ShowCount,
			ShowBreakdown: tok.ShowBreakdown,
			ShowSnippet:   tok.ShowSnippet,
		},
	}, nil
}

func (r *EmbedRepo) findByToken(ctx context.Context, token string) (*EmbedToken, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.token, e.product_id, e.owner_id, e.domain, e.status,
		       e.show_rating, e.show_count, e.show_breakdown, e.show_snippet,
		       e.admin_note, e.created_at, e.approved_at,
		       p.name AS product_name, '' AS owner_email, '' AS owner_company
		FROM embed_tokens e
		JOIN products p ON p.id = e.product_id
		WHERE e.token = ?`, token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	toks, err := scanEmbedRows(rows)
	if err != nil {
		return nil, err
	}
	if len(toks) == 0 {
		return nil, ErrNotFound
	}
	return toks[0], nil
}

func scanEmbedRows(rows *sql.Rows) ([]*EmbedToken, error) {
	var result []*EmbedToken
	for rows.Next() {
		var tok EmbedToken
		var showRating, showCount, showBreakdown, showSnippet int
		var approvedAt sql.NullTime
		if err := rows.Scan(
			&tok.ID, &tok.Token, &tok.ProductID, &tok.OwnerID, &tok.Domain, &tok.Status,
			&showRating, &showCount, &showBreakdown, &showSnippet,
			&tok.AdminNote, &tok.CreatedAt, &approvedAt,
			&tok.ProductName, &tok.OwnerEmail, &tok.OwnerCompany,
		); err != nil {
			return nil, err
		}
		tok.ShowRating = showRating == 1
		tok.ShowCount = showCount == 1
		tok.ShowBreakdown = showBreakdown == 1
		tok.ShowSnippet = showSnippet == 1
		if approvedAt.Valid {
			tok.ApprovedAt = &approvedAt.Time
		}
		result = append(result, &tok)
	}
	if result == nil {
		result = []*EmbedToken{}
	}
	return result, nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
```

- [ ] **Step 5: Verify compilation**

```bash
cd /home/rafiur/Desktop/projects/final-review/be && go build ./...
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add be/migrations/008_embed_tokens.sql be/internal/repository/embed.go
git commit -m "feat: embed_tokens migration and EmbedRepo"
```

---

### Task 2: Widget Public Endpoint + CORS Fix

**Files:**
- Create: `be/internal/handlers/widget.go`
- Modify: `be/internal/router/router.go` (CORS middleware — add widget path detection)

**Interfaces:**
- Consumes: `repository.EmbedRepo` (from Task 1) — specifically `FindByToken` and `GetWidgetData`
- Produces:
  - `handlers.WidgetHandler` struct
  - `handlers.NewWidgetHandler(embeds *repository.EmbedRepo) *WidgetHandler`
  - `(h *WidgetHandler) GetWidget(w http.ResponseWriter, r *http.Request)`

- [ ] **Step 1: Create the widget handler**

Create `be/internal/handlers/widget.go`:

```go
package handlers

import (
	"log"
	"net/http"
	"net/url"
	"strings"

	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type WidgetHandler struct {
	embeds *repository.EmbedRepo
}

func NewWidgetHandler(embeds *repository.EmbedRepo) *WidgetHandler {
	return &WidgetHandler{embeds: embeds}
}

func (h *WidgetHandler) GetWidget(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")

	tok, err := h.embeds.FindByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found")
		return
	}

	if tok.Status != "approved" {
		writeError(w, http.StatusForbidden, "not_approved")
		return
	}

	// Domain check — missing Origin/Referer is allowed (direct curl, server-side fetch)
	caller := extractWidgetHost(r.Header.Get("Origin"))
	if caller == "" {
		caller = extractWidgetHost(r.Header.Get("Referer"))
	}
	if caller != "" && !widgetDomainsMatch(caller, tok.Domain) {
		log.Printf("WARN widget token=%s: domain mismatch caller=%q registered=%q", token, caller, tok.Domain)
		writeError(w, http.StatusForbidden, "domain_mismatch")
		return
	}

	data, err := h.embeds.GetWidgetData(r.Context(), tok)
	if err != nil {
		log.Printf("ERROR widget GetWidgetData token=%s: %v", token, err)
		writeError(w, http.StatusInternalServerError, "internal_error")
		return
	}

	writeJSON(w, http.StatusOK, data)
}

// extractWidgetHost returns the bare lowercase hostname from an Origin or Referer header value.
func extractWidgetHost(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.ToLower(u.Hostname())
}

// widgetDomainsMatch returns true when caller and registered resolve to the same domain,
// treating www. as optional on both sides.
func widgetDomainsMatch(caller, registered string) bool {
	normalize := func(h string) string {
		return strings.TrimPrefix(strings.ToLower(h), "www.")
	}
	return normalize(caller) == normalize(registered)
}
```

- [ ] **Step 2: Add widget path detection to CORS middleware**

Open `be/internal/router/router.go`. Find the `buildCORSMiddleware` function. Add a widget-path early-return at the top of the returned handler, BEFORE the existing origin logic:

The function currently looks like:
```go
return func(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")
        if wildcard {
```

Change it to:
```go
return func(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Widget endpoint is always open — browsers need wildcard CORS to fetch cross-origin
        if strings.HasPrefix(r.URL.Path, "/api/v1/widget/") {
            w.Header().Set("Access-Control-Allow-Origin", "*")
            w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
            if r.Method == http.MethodOptions {
                w.WriteHeader(http.StatusNoContent)
                return
            }
            next.ServeHTTP(w, r)
            return
        }

        origin := r.Header.Get("Origin")
        if wildcard {
```

The rest of `buildCORSMiddleware` stays unchanged.

- [ ] **Step 3: Verify compilation**

```bash
cd /home/rafiur/Desktop/projects/final-review/be && go build ./...
```

Expected: no errors. (`strings` is already imported in router.go.)

- [ ] **Step 4: Manual smoke test**

Start the backend. Run:
```bash
curl -s http://localhost:8080/api/v1/widget/nonexistent | jq .
```
Expected: `{"error":"not_found"}`

```bash
curl -s -X OPTIONS http://localhost:8080/api/v1/widget/abc \
  -H "Origin: https://mybrand.com" -v 2>&1 | grep -i "access-control"
```
Expected: `Access-Control-Allow-Origin: *`

- [ ] **Step 5: Commit**

```bash
git add be/internal/handlers/widget.go be/internal/router/router.go
git commit -m "feat: widget public endpoint with per-path wildcard CORS"
```

---

### Task 3: Owner Embed Endpoints

**Files:**
- Modify: `be/internal/handlers/owner.go`

**Interfaces:**
- Consumes:
  - `repository.EmbedRepo` — `Create`, `ListByOwner` (from Task 1)
  - `repository.ProductRepo.OwnedBy` (already exists)
  - `middleware.UserIDFromCtx` (already exists)
- Produces:
  - `POST /owner/embed` handled by `OwnerHandler.RequestEmbed`
  - `GET /owner/embed` handled by `OwnerHandler.ListEmbeds`
  - `OwnerHandler` struct gains `embeds *repository.EmbedRepo` field
  - `NewOwnerHandler` gains `embeds *repository.EmbedRepo` parameter

- [ ] **Step 1: Add imports and update struct + constructor**

In `be/internal/handlers/owner.go`, the current file starts with:
```go
package handlers

import (
	"log"
	"net/http"
	"strconv"

	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
)

type OwnerHandler struct {
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	users    *repository.UserRepo
}

func NewOwnerHandler(reviews *repository.ReviewRepo, products *repository.ProductRepo, users *repository.UserRepo) *OwnerHandler {
	return &OwnerHandler{reviews: reviews, products: products, users: users}
}
```

Replace with:
```go
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
```

- [ ] **Step 2: Add RequestEmbed and ListEmbeds methods**

Append to the end of `be/internal/handlers/owner.go`:

```go
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
```

- [ ] **Step 3: Verify compilation**

```bash
cd /home/rafiur/Desktop/projects/final-review/be && go build ./...
```

Expected: compile error about `NewOwnerHandler` call in router.go (wrong number of args) — that's expected and will be fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add be/internal/handlers/owner.go
git commit -m "feat: owner embed request and list endpoints"
```

---

### Task 4: Admin Embed Endpoints + Stats Update

**Files:**
- Modify: `be/internal/handlers/admin.go`

**Interfaces:**
- Consumes:
  - `repository.EmbedRepo` — `ListAll`, `UpdateStatus` (from Task 1)
- Produces:
  - `AdminHandler` gains `embeds *repository.EmbedRepo` field
  - `NewAdminHandler` gains `embeds *repository.EmbedRepo` parameter (added as last param)
  - `GET /admin/embeds` → `AdminHandler.ListEmbeds`
  - `PATCH /admin/embeds/{id}` → `AdminHandler.UpdateEmbed`
  - `GET /admin/stats` response gains `"pending_embeds": N`

- [ ] **Step 1: Update AdminHandler struct and constructor**

In `be/internal/handlers/admin.go`, find and update the struct and constructor:

```go
// Current struct:
type AdminHandler struct {
	db       *sql.DB
	users    *repository.UserRepo
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	pages    *repository.PageRepo
	storage  storage.Storage
}

// New struct — add embeds field:
type AdminHandler struct {
	db       *sql.DB
	users    *repository.UserRepo
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	pages    *repository.PageRepo
	storage  storage.Storage
	embeds   *repository.EmbedRepo
}

// Current constructor:
func NewAdminHandler(
	db *sql.DB,
	users *repository.UserRepo,
	reviews *repository.ReviewRepo,
	products *repository.ProductRepo,
	pages *repository.PageRepo,
	s storage.Storage,
) *AdminHandler {
	return &AdminHandler{db: db, users: users, reviews: reviews, products: products, pages: pages, storage: s}
}

// New constructor — add embeds parameter:
func NewAdminHandler(
	db *sql.DB,
	users *repository.UserRepo,
	reviews *repository.ReviewRepo,
	products *repository.ProductRepo,
	pages *repository.PageRepo,
	s storage.Storage,
	embeds *repository.EmbedRepo,
) *AdminHandler {
	return &AdminHandler{db: db, users: users, reviews: reviews, products: products, pages: pages, storage: s, embeds: embeds}
}
```

- [ ] **Step 2: Update Stats handler to include pending_embeds**

In `be/internal/handlers/admin.go`, find the `Stats` method. It currently ends with:
```go
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE is_product_owner = 1 AND owner_verified = 0`).Scan(&pendingOwners)
	writeJSON(w, http.StatusOK, map[string]int{
		...
		"pending_owners":   pendingOwners,
	})
```

Add a `pendingEmbeds` variable and query before the `writeJSON` call:
```go
	var pendingEmbeds int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM embed_tokens WHERE status = 'pending'`).Scan(&pendingEmbeds)
	writeJSON(w, http.StatusOK, map[string]int{
		"total_users":      totalUsers,
		"total_reviews":    totalReviews,
		"pending_reviews":  pendingReviews,
		"total_comments":   totalComments,
		"pending_comments": pendingComments,
		"total_products":   totalProducts,
		"total_pages":      totalPages,
		"total_categories": totalCategories,
		"pending_owners":   pendingOwners,
		"pending_embeds":   pendingEmbeds,
	})
```

- [ ] **Step 3: Add ListEmbeds and UpdateEmbed methods**

Append to `be/internal/handlers/admin.go`:

```go
// ── Embed Tokens ──────────────────────────────────────────────────────────────

func (h *AdminHandler) ListEmbeds(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	tokens, err := h.embeds.ListAll(r.Context(), status)
	if err != nil {
		log.Printf("ERROR admin ListEmbeds: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to fetch embeds")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": tokens})
}

func (h *AdminHandler) UpdateEmbed(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Status    string `json:"status"`
		AdminNote string `json:"admin_note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Status != "approved" && body.Status != "revoked" {
		writeError(w, http.StatusBadRequest, "status must be 'approved' or 'revoked'")
		return
	}
	if err := h.embeds.UpdateStatus(r.Context(), id, body.Status, body.AdminNote); err != nil {
		log.Printf("ERROR admin UpdateEmbed id=%d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to update embed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 4: Verify compilation (expected failure)**

```bash
cd /home/rafiur/Desktop/projects/final-review/be && go build ./...
```

Expected: compile error about `NewAdminHandler` call in router.go — fixed in Task 5.

- [ ] **Step 5: Commit**

```bash
git add be/internal/handlers/admin.go
git commit -m "feat: admin embed list/approve/revoke endpoints and pending_embeds stat"
```

---

### Task 5: Backend Wiring (Router)

**Files:**
- Modify: `be/internal/router/router.go`

**Interfaces:**
- Consumes: `NewEmbedRepo` (Task 1), `NewWidgetHandler` (Task 2), updated `NewOwnerHandler` (Task 3), updated `NewAdminHandler` (Task 4)

- [ ] **Step 1: Instantiate EmbedRepo and WidgetHandler**

In `be/internal/router/router.go`, in the `New` function, after the existing repo instantiations add:

```go
embedRepo := repository.NewEmbedRepo(db, cfg.SiteURL)
```

After the existing handler instantiations add:

```go
widgetH := handlers.NewWidgetHandler(embedRepo)
```

- [ ] **Step 2: Update NewOwnerHandler call**

Find:
```go
ownerH    := handlers.NewOwnerHandler(reviewRepo, productRepo, userRepo)
```
Replace with:
```go
ownerH    := handlers.NewOwnerHandler(reviewRepo, productRepo, userRepo, embedRepo)
```

- [ ] **Step 3: Update NewAdminHandler call**

Find:
```go
adminH    := handlers.NewAdminHandler(db, userRepo, reviewRepo, productRepo, pageRepo, store)
```
Replace with:
```go
adminH    := handlers.NewAdminHandler(db, userRepo, reviewRepo, productRepo, pageRepo, store, embedRepo)
```

- [ ] **Step 4: Register widget route**

In the `r.Route("/api/v1", ...)` block, add the widget route in the **public** section (no auth middleware), alongside the other public GET routes:

```go
r.Get("/widget/{token}", widgetH.GetWidget)
```

- [ ] **Step 5: Register owner embed routes**

In the authenticated group (inside `r.Group(func(r chi.Router) { r.Use(mw.Auth(cfg, rdb)) ... })`), add:

```go
r.Post("/owner/embed", ownerH.RequestEmbed)
r.Get("/owner/embed", ownerH.ListEmbeds)
```

- [ ] **Step 6: Register admin embed routes**

In the admin-only group (inside `r.Group(func(r chi.Router) { r.Use(mw.Admin(cfg, rdb, userRepo)) ... })`), add:

```go
r.Get("/admin/embeds", adminH.ListEmbeds)
r.Patch("/admin/embeds/{id}", adminH.UpdateEmbed)
```

- [ ] **Step 7: Verify compilation**

```bash
cd /home/rafiur/Desktop/projects/final-review/be && go build ./...
```

Expected: no errors.

- [ ] **Step 8: Integration smoke test**

Start the backend with a local DB that has the migration applied. Create a test token directly in the DB:

```sql
INSERT INTO embed_tokens (token, product_id, owner_id, domain, status, show_rating, show_count)
VALUES ('testtoken123', 1, 1, 'localhost', 'approved', 1, 1);
```

Then test:
```bash
curl -s http://localhost:8080/api/v1/widget/testtoken123 | jq .
```
Expected: JSON with `product`, `avg_rating`, `review_count`, `breakdown`, `config`.

```bash
curl -s http://localhost:8080/api/v1/widget/testtoken123 \
  -H "Origin: https://evil.com" | jq .
```
Expected: `{"error":"domain_mismatch"}`

- [ ] **Step 9: Commit**

```bash
git add be/internal/router/router.go
git commit -m "feat: wire embed routes into router"
```

---

### Task 6: widget.js (Vanilla JS Badge Script)

**Files:**
- Create: `fe/public/widget.js`

This is a static file. It will be served at `/widget.js` on the deployed site. No bundler, no imports, pure IIFE.

- [ ] **Step 1: Create the widget script**

Create `fe/public/widget.js`:

```javascript
(function () {
  "use strict";

  // Derive API base from where this script was loaded — works regardless of deployment URL.
  var scriptEl = document.currentScript;
  var BASE_URL = scriptEl ? new URL(scriptEl.src).origin : "https://bdranks.com";

  // Find all script tags with data-token on this page.
  var scripts = document.querySelectorAll("script[data-token]");
  scripts.forEach(function (script) {
    var token = script.getAttribute("data-token");
    if (!token) return;

    var container = document.createElement("div");
    container.setAttribute("data-bdranks", token);
    script.parentNode.insertBefore(container, script.nextSibling);

    fetch(BASE_URL + "/api/v1/widget/" + encodeURIComponent(token))
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (e) {
            throw new Error(e.error || "error");
          });
        }
        return res.json();
      })
      .then(function (data) {
        container.innerHTML = renderBadge(data, BASE_URL);
      })
      .catch(function (err) {
        container.innerHTML = renderError(err.message, BASE_URL);
      });
  });

  function renderStars(rating, size) {
    size = size || 16;
    var html = "";
    for (var i = 1; i <= 5; i++) {
      html +=
        '<span style="color:' +
        (i <= Math.round(rating) ? "#f59e0b" : "#d1d5db") +
        ";font-size:" +
        size +
        'px">&#9733;</span>';
    }
    return html;
  }

  function renderBreakdown(breakdown, total) {
    var html = '<div style="margin-top:8px">';
    [5, 4, 3, 2, 1].forEach(function (star) {
      var count = breakdown[String(star)] || 0;
      var pct = total > 0 ? Math.round((count / total) * 100) : 0;
      html +=
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">' +
        '<span style="font-size:11px;color:#6b7280;width:20px;text-align:right">' +
        star +
        "&#9733;</span>" +
        '<div style="flex:1;background:#f3f4f6;border-radius:2px;height:6px">' +
        '<div style="width:' +
        pct +
        "%;background:#f59e0b;height:6px;border-radius:2px\"></div>" +
        "</div>" +
        '<span style="font-size:11px;color:#6b7280;width:28px">' +
        pct +
        "%</span>" +
        "</div>";
    });
    html += "</div>";
    return html;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderBadge(data, base) {
    var cfg = data.config;
    var html =
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
      "border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#fff;" +
      'display:inline-block;min-width:220px;max-width:380px;box-sizing:border-box">';

    // Header row: BdRanks logo + product name link
    html +=
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
      '<a href="' +
      base +
      '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:6px;text-decoration:none">' +
      '<span style="background:#1d4ed8;color:#fff;font-weight:800;font-size:11px;padding:2px 6px;border-radius:4px;letter-spacing:.5px">Bd</span>' +
      '<span style="font-size:11px;color:#6b7280;font-weight:500">BdRanks</span>' +
      "</a>" +
      '<a href="' +
      esc(data.product.url) +
      '" target="_blank" rel="noopener" style="font-size:12px;font-weight:600;color:#111827;text-decoration:none;' +
      'max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
      esc(data.product.name) +
      '">' +
      esc(data.product.name) +
      " &#8599;</a>" +
      "</div>";

    // Rating + count
    if (cfg.show_rating || cfg.show_count) {
      html += '<div style="display:flex;align-items:center;gap:8px">';
      if (cfg.show_rating) {
        html +=
          renderStars(data.avg_rating) +
          '<span style="font-size:15px;font-weight:700;color:#111827">' +
          data.avg_rating.toFixed(1) +
          "</span>";
      }
      if (cfg.show_count) {
        html +=
          '<span style="font-size:12px;color:#6b7280">' +
          data.review_count +
          " review" +
          (data.review_count !== 1 ? "s" : "") +
          "</span>";
      }
      html += "</div>";
    }

    // Breakdown bar chart
    if (cfg.show_breakdown) {
      html += renderBreakdown(data.breakdown, data.review_count);
    }

    // Latest review snippet
    if (cfg.show_snippet && data.latest_review) {
      var lr = data.latest_review;
      html +=
        '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #f3f4f6">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
        renderStars(lr.rating, 13) +
        '<span style="font-size:11px;color:#9ca3af">' +
        esc(lr.date) +
        "</span></div>" +
        '<p style="margin:0;font-size:12px;color:#374151;font-style:italic">&ldquo;' +
        esc(lr.title) +
        "&rdquo;</p></div>";
    }

    // Footer trust seal
    html +=
      '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #f9fafb">' +
      '<a href="' +
      esc(data.product.url) +
      '" target="_blank" rel="noopener" style="font-size:10px;color:#9ca3af;text-decoration:none">' +
      "Verified on BdRanks &middot; bdranks.com</a></div>";

    html += "</div>";
    return html;
  }

  function renderError(msg, base) {
    var label =
      msg === "not_approved"
        ? "Not approved"
        : msg === "domain_mismatch"
        ? "Not authorized for this domain"
        : "Unavailable";
    return (
      '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
      "border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#f9fafb;" +
      'display:inline-flex;align-items:center;gap:8px">' +
      '<span style="background:#9ca3af;color:#fff;font-weight:800;font-size:11px;padding:2px 6px;border-radius:4px">Bd</span>' +
      '<span style="font-size:12px;color:#9ca3af">' +
      label +
      " &middot; bdranks.com</span></div>"
    );
  }
})();
```

- [ ] **Step 2: Manual test in browser**

Start the FE dev server (`npm run dev` in `fe/`). Create a test HTML file:

```html
<!DOCTYPE html>
<html>
<body>
  <script src="http://localhost:5173/widget.js" data-token="testtoken123"></script>
</body>
</html>
```

Open it in a browser. Expected: badge renders with product name, stars, and review count.

- [ ] **Step 3: Commit**

```bash
git add fe/public/widget.js
git commit -m "feat: vanilla JS widget.js badge script"
```

---

### Task 7: FE Owner Embed Page

**Files:**
- Create: `fe/src/pages/OwnerEmbed.tsx`

**Interfaces:**
- Consumes (API):
  - `GET /profile/products` → `ApiOwnerProduct[]` (already exists in `fe/src/lib/api.ts`)
  - `GET /owner/embed` → `{ data: EmbedToken[] }` (new endpoint from Task 3)
  - `POST /owner/embed` → request body, returns `EmbedToken` (new endpoint from Task 3)
- Consumes (FE):
  - `useAuth()` from `@/hooks/useAuth`
  - `apiFetch` from `@/lib/api`
  - shadcn: `Button`, `Input`, `Switch`, `Label`, `Badge`, `Select/*`, `Dialog/*`
  - `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
  - `toast` from `sonner`

- [ ] **Step 1: Create OwnerEmbed.tsx**

Create `fe/src/pages/OwnerEmbed.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiOwnerProduct } from "@/lib/api";
import { Copy, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface EmbedToken {
  id: number;
  token: string;
  product_id: number;
  product_name: string;
  domain: string;
  status: "pending" | "approved" | "revoked";
  show_rating: boolean;
  show_count: boolean;
  show_breakdown: boolean;
  show_snippet: boolean;
  admin_note: string;
  created_at: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied ? (
        <CheckCheck className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: EmbedToken["status"] }) {
  if (status === "approved")
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
        Approved
      </Badge>
    );
  if (status === "revoked") return <Badge variant="destructive">Revoked</Badge>;
  return <Badge variant="secondary">Pending approval</Badge>;
}

export default function OwnerEmbed() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const siteUrl = window.location.origin;

  const [productId, setProductId] = useState("");
  const [domain, setDomain] = useState("");
  const [showRating, setShowRating] = useState(true);
  const [showCount, setShowCount] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSnippet, setShowSnippet] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !user.is_product_owner)) navigate("/");
  }, [user, loading, navigate]);

  const { data: products = [] } = useQuery<ApiOwnerProduct[]>({
    queryKey: ["owner-products"],
    queryFn: () => apiFetch<ApiOwnerProduct[]>("/profile/products"),
    enabled: !!user?.is_product_owner,
  });

  const { data: embedsData } = useQuery<{ data: EmbedToken[] }>({
    queryKey: ["owner-embeds"],
    queryFn: () => apiFetch<{ data: EmbedToken[] }>("/owner/embed"),
    enabled: !!user?.is_product_owner,
  });
  const embeds = embedsData?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/owner/embed", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-embeds"] });
      setProductId("");
      setDomain("");
      setShowRating(true);
      setShowCount(true);
      setShowBreakdown(false);
      setShowSnippet(false);
      toast.success("Request submitted — awaiting admin approval.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !domain) return;
    createMut.mutate({
      product_id: Number(productId),
      domain,
      show_rating: showRating,
      show_count: showCount,
      show_breakdown: showBreakdown,
      show_snippet: showSnippet,
    });
  };

  const scriptSnippet = (token: string) =>
    `<script src="${siteUrl}/widget.js" data-token="${token}"></script>`;

  const iframeSnippet = (token: string) =>
    `<iframe src="${siteUrl}/embed/${token}" width="320" height="160" frameborder="0" scrolling="no" style="border:none;overflow:hidden" allowtransparency="true"></iframe>`;

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <PageHead title="Embed Codes" noindex />
      <Header />
      <main className="container px-4 py-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">Embed Codes</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Add a BdRanks review badge to your website. Each embed is
          product-specific and requires admin approval before it goes live.
        </p>

        {/* Request form */}
        <div className="border rounded-xl p-6 mb-10 bg-card">
          <h2 className="font-semibold mb-4">Request a new embed</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Product
                </Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Your website domain
                </Label>
                <Input
                  placeholder="mybrand.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">
                Display options
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    ["Average rating", showRating, setShowRating],
                    ["Review count", showCount, setShowCount],
                    ["Rating breakdown", showBreakdown, setShowBreakdown],
                    ["Latest review snippet", showSnippet, setShowSnippet],
                  ] as [string, boolean, (v: boolean) => void][]
                ).map(([label, val, set]) => (
                  <div key={label} className="flex items-center gap-2">
                    <Switch
                      checked={val}
                      onCheckedChange={set}
                      id={`sw-${label}`}
                    />
                    <Label
                      htmlFor={`sw-${label}`}
                      className="text-sm cursor-pointer"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={!productId || !domain || createMut.isPending}
            >
              {createMut.isPending ? "Submitting…" : "Request embed"}
            </Button>
          </form>
        </div>

        {/* Existing embeds list */}
        {embeds.length > 0 && (
          <div>
            <h2 className="font-semibold mb-4">Your embed codes</h2>
            <div className="space-y-4">
              {embeds.map((tok) => (
                <div key={tok.id} className="border rounded-xl p-5 bg-card">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-medium text-sm">{tok.product_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {tok.domain}
                      </p>
                    </div>
                    <StatusBadge status={tok.status} />
                  </div>

                  {tok.admin_note && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2 mb-3">
                      Admin note: {tok.admin_note}
                    </p>
                  )}

                  {tok.status === "approved" && (
                    <div className="space-y-2.5">
                      {[
                        ["Script tag", scriptSnippet(tok.token)],
                        ["iframe", iframeSnippet(tok.token)],
                      ].map(([label, snippet]) => (
                        <div key={label}>
                          <p className="text-[11px] font-medium text-muted-foreground mb-1">
                            {label}
                          </p>
                          <div className="flex items-center gap-2 bg-muted/40 rounded px-3 py-2">
                            <code className="text-[11px] flex-1 overflow-x-auto whitespace-nowrap">
                              {snippet}
                            </code>
                            <CopyButton text={snippet} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /home/rafiur/Desktop/projects/final-review/fe && npm run build 2>&1 | tail -20
```

Expected: build succeeds (route not wired yet so no 404 — just type-check).

- [ ] **Step 3: Commit**

```bash
git add fe/src/pages/OwnerEmbed.tsx
git commit -m "feat: owner embed codes management page"
```

---

### Task 8: FE EmbedPage (iframe) + App Wiring + Header Link

**Files:**
- Create: `fe/src/pages/EmbedPage.tsx`
- Modify: `fe/src/App.tsx` (add two routes: `/owner-embed`, `/embed/:token`)
- Modify: `fe/src/components/Header.tsx` (add "Embed Codes" link for owners)

**Interfaces:**
- Consumes:
  - `GET /api/v1/widget/:token` → `WidgetData` (from Task 2)
  - React Router `useParams`

- [ ] **Step 1: Create EmbedPage.tsx**

Create `fe/src/pages/EmbedPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

interface WidgetData {
  product: { id: number; name: string; url: string };
  avg_rating: number;
  review_count: number;
  breakdown: Record<string, number>;
  latest_review?: { title: string; rating: number; date: string };
  config: {
    show_rating: boolean;
    show_count: boolean;
    show_breakdown: boolean;
    show_snippet: boolean;
  };
}

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            color: i <= Math.round(rating) ? "#f59e0b" : "#d1d5db",
            fontSize: size,
          }}
        >
          ★
        </span>
      ))}
    </>
  );
}

function ErrorState({ message }: { message: string }) {
  const label =
    message === "not_approved"
      ? "Not approved"
      : message === "domain_mismatch"
      ? "Not authorized for this domain"
      : "Unavailable";
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "12px 14px",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        background: "#f9fafb",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        style={{
          background: "#9ca3af",
          color: "#fff",
          fontWeight: 800,
          fontSize: 11,
          padding: "2px 6px",
          borderRadius: 4,
        }}
      >
        Bd
      </span>
      <span style={{ fontSize: 12, color: "#9ca3af" }}>
        {label} · bdranks.com
      </span>
    </div>
  );
}

export default function EmbedPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<WidgetData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/widget/${token}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { throw new Error(e.error); });
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  if (error) return <ErrorState message={error} />;
  if (!data)
    return (
      <div style={{ padding: 14, fontSize: 12, color: "#9ca3af" }}>
        Loading…
      </div>
    );

  const cfg = data.config;
  const s: React.CSSProperties = {
    fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  };

  return (
    <div
      style={{
        ...s,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "14px 16px",
        background: "#fff",
        maxWidth: 380,
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <a
          href="https://bdranks.com"
          target="_blank"
          rel="noopener"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
          }}
        >
          <span
            style={{
              background: "#1d4ed8",
              color: "#fff",
              fontWeight: 800,
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            Bd
          </span>
          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
            BdRanks
          </span>
        </a>
        <a
          href={data.product.url}
          target="_blank"
          rel="noopener"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#111827",
            textDecoration: "none",
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={data.product.name}
        >
          {data.product.name} ↗
        </a>
      </div>

      {/* Rating + count */}
      {(cfg.show_rating || cfg.show_count) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {cfg.show_rating && (
            <>
              <Stars rating={data.avg_rating} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                {data.avg_rating.toFixed(1)}
              </span>
            </>
          )}
          {cfg.show_count && (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {data.review_count} review
              {data.review_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Breakdown */}
      {cfg.show_breakdown && (
        <div style={{ marginTop: 8 }}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = data.breakdown[String(star)] ?? 0;
            const pct =
              data.review_count > 0
                ? Math.round((count / data.review_count) * 100)
                : 0;
            return (
              <div
                key={star}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 3,
                }}
              >
                <span
                  style={{ fontSize: 11, color: "#6b7280", width: 20, textAlign: "right" }}
                >
                  {star}★
                </span>
                <div
                  style={{
                    flex: 1,
                    background: "#f3f4f6",
                    borderRadius: 2,
                    height: 6,
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      background: "#f59e0b",
                      height: 6,
                      borderRadius: 2,
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: "#6b7280", width: 28 }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Latest review snippet */}
      {cfg.show_snippet && data.latest_review && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid #f3f4f6",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
          >
            <Stars rating={data.latest_review.rating} size={13} />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {data.latest_review.date}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#374151", fontStyle: "italic" }}>
            &ldquo;{data.latest_review.title}&rdquo;
          </p>
        </div>
      )}

      {/* Trust seal */}
      <div
        style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #f9fafb" }}
      >
        <a
          href={data.product.url}
          target="_blank"
          rel="noopener"
          style={{ fontSize: 10, color: "#9ca3af", textDecoration: "none" }}
        >
          Verified on BdRanks · bdranks.com
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire routes in App.tsx**

In `fe/src/App.tsx`, add two imports:
```tsx
import OwnerEmbed from "./pages/OwnerEmbed";
import EmbedPage from "./pages/EmbedPage";
```

Add two routes inside `<Routes>`, before the catch-all `*` route:
```tsx
<Route path="/owner-embed" element={<OwnerEmbed />} />
<Route path="/embed/:token" element={<EmbedPage />} />
```

- [ ] **Step 3: Add "Embed Codes" link to Header for owners**

In `fe/src/components/Header.tsx`, find the section that conditionally renders the Owner Dashboard link:
```tsx
{user.is_product_owner && (
  <Link ...>
    <LayoutDashboard ... /> Owner Dashboard
  </Link>
)}
```

Add the Embed Codes link directly after the existing owner dashboard link (both inside the same `{user.is_product_owner && (...)}` block or as a sibling check). The exact location depends on whether it's desktop nav or mobile — add it in BOTH places. Add import for `Code2` from lucide-react if available, or use `Braces`. Use the same styling as the dashboard link.

For the desktop nav (after Owner Dashboard link):
```tsx
{user.is_product_owner && (
  <Link
    to="/owner-embed"
    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
  >
    <Code2 className="h-4 w-4" />
    {t("nav.embedCodes")}
  </Link>
)}
```

For the mobile menu, use the same pattern as the existing mobile Owner Dashboard link.

Add translation key `"nav.embedCodes": "Embed Codes"` to `fe/src/locales/en/translation.json` and `"nav.embedCodes": "এম্বেড কোড"` to `fe/src/locales/bn/translation.json`.

Add import: `import { Code2 } from "lucide-react";` to `Header.tsx`.

- [ ] **Step 4: Verify build**

```bash
cd /home/rafiur/Desktop/projects/final-review/fe && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Manual browser test**

Start backend and FE dev server. Log in as a verified owner. Navigate to `/owner-embed`. Verify:
- Products dropdown populates
- Can submit a request (check the DB: `SELECT * FROM embed_tokens;`)
- Status shows "Pending approval"

Approve it directly in the DB: `UPDATE embed_tokens SET status = 'approved' WHERE id = 1;`

Refresh the page. Verify:
- Status shows "Approved"
- Two code snippets appear with copy buttons

Test the iframe at `/embed/{token}`:
- Open the URL directly in a browser — verify the badge renders

- [ ] **Step 6: Commit**

```bash
git add fe/src/pages/EmbedPage.tsx fe/src/App.tsx fe/src/components/Header.tsx \
        fe/src/locales/en/translation.json fe/src/locales/bn/translation.json
git commit -m "feat: embed iframe page, App routes, Header link for owners"
```

---

### Task 9: CMS Embeds Page

**Files:**
- Create: `cms/src/pages/Embeds.tsx`
- Modify: `cms/src/App.tsx` (add `/embeds` route)
- Modify: `cms/src/components/Sidebar.tsx` (add Embeds nav item with pending badge)
- Modify: `cms/src/components/Layout.tsx` (pass `pendingEmbeds` to Sidebar)
- Modify: `cms/src/lib/api.ts` (add `pending_embeds` to `AdminStats`)

**Interfaces:**
- Consumes (API):
  - `GET /admin/embeds?status=pending` → `{ data: AdminEmbed[] }`
  - `PATCH /admin/embeds/{id}` → body `{ status, admin_note }`
  - `GET /admin/stats` → `AdminStats` (now includes `pending_embeds`)

- [ ] **Step 1: Add pending_embeds to AdminStats type**

In `cms/src/lib/api.ts`, find `AdminStats` interface and add the field:
```ts
export interface AdminStats {
  total_users: number;
  total_reviews: number;
  pending_reviews: number;
  total_comments: number;
  pending_comments: number;
  total_products: number;
  total_pages: number;
  total_categories: number;
  pending_owners: number;
  pending_embeds: number;   // ← add this
}
```

- [ ] **Step 2: Update Layout.tsx to pass pendingEmbeds**

In `cms/src/components/Layout.tsx`, find the `<Sidebar ...>` usage and add the `pendingEmbeds` prop:
```tsx
<Sidebar
  pendingComments={stats?.pending_comments}
  pendingOwners={stats?.pending_owners}
  pendingEmbeds={stats?.pending_embeds}
/>
```

- [ ] **Step 3: Update Sidebar.tsx**

In `cms/src/components/Sidebar.tsx`:

1. Add `{ label: "Embeds", icon: Code2, to: "/embeds", badge: "embeds" }` to the `NAV` array (after Owners):
```ts
import { LayoutDashboard, FileText, MessageSquare, Package,
  Tag, BookOpen, Users, LogOut, ChevronRight, Building2, Code2 } from "lucide-react";

const NAV = [
  { label: "Dashboard",  icon: LayoutDashboard, to: "/" },
  { label: "Reviews",    icon: FileText,         to: "/reviews" },
  { label: "Comments",   icon: MessageSquare,    to: "/comments", badge: "pending" },
  { label: "Products",   icon: Package,          to: "/products" },
  { label: "Categories", icon: Tag,              to: "/categories" },
  { label: "Pages",      icon: BookOpen,         to: "/pages" },
  { label: "Owners",     icon: Building2,        to: "/owners",  badge: "owners" },
  { label: "Embeds",     icon: Code2,            to: "/embeds",  badge: "embeds" },
  { label: "Users",      icon: Users,            to: "/users" },
];
```

2. Add `pendingEmbeds?: number` to `Props` interface:
```ts
interface Props {
  pendingComments?: number;
  pendingOwners?: number;
  pendingEmbeds?: number;
}
export function Sidebar({ pendingComments = 0, pendingOwners = 0, pendingEmbeds = 0 }: Props) {
```

3. In the badge rendering inside the nav map, add a case for `"embeds"`:
```tsx
{badge === "embeds" && pendingEmbeds > 0 && (
  <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
    {pendingEmbeds}
  </span>
)}
```

- [ ] **Step 4: Create Embeds.tsx**

Create `cms/src/pages/Embeds.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Filter } from "lucide-react";

interface AdminEmbed {
  id: number;
  token: string;
  product_id: number;
  product_name: string;
  owner_id: number;
  owner_email: string;
  owner_company: string;
  domain: string;
  status: "pending" | "approved" | "revoked";
  show_rating: boolean;
  show_count: boolean;
  show_breakdown: boolean;
  show_snippet: boolean;
  admin_note: string;
  created_at: string;
}

function StatusBadge({ status }: { status: AdminEmbed["status"] }) {
  if (status === "approved")
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">
        Approved
      </Badge>
    );
  if (status === "revoked") return <Badge variant="destructive">Revoked</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export default function Embeds() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selected, setSelected] = useState<AdminEmbed | null>(null);
  const [action, setAction] = useState<"approved" | "revoked">("approved");
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery<{ data: AdminEmbed[] }>({
    queryKey: ["admin-embeds", statusFilter],
    queryFn: () =>
      apiFetch(`/admin/embeds${statusFilter ? `?status=${statusFilter}` : ""}`),
  });
  const embeds = data?.data ?? [];

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/admin/embeds/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-embeds"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success(`Embed ${action}`);
      setSelected(null);
      setNote("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openAction = (embed: AdminEmbed, act: "approved" | "revoked") => {
    setSelected(embed);
    setAction(act);
    setNote("");
  };

  const displayOptions = (e: AdminEmbed) =>
    [
      e.show_rating && "rating",
      e.show_count && "count",
      e.show_breakdown && "breakdown",
      e.show_snippet && "snippet",
    ]
      .filter(Boolean)
      .join(", ") || "—";

  return (
    <Layout title="Embed Requests">
      <div className="flex items-center gap-3 mb-6">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="revoked">Revoked</SelectItem>
            <SelectItem value="">All</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{embeds.length} result{embeds.length !== 1 ? "s" : ""}</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : embeds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No embed requests found.</p>
      ) : (
        <div className="space-y-3">
          {embeds.map((e) => (
            <div
              key={e.id}
              className="border rounded-lg p-4 bg-card flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={e.status} />
                  <span className="font-medium text-sm">{e.product_name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Domain:{" "}
                  <span className="font-mono text-foreground">{e.domain}</span>
                  {" · "}Owner:{" "}
                  {e.owner_company || e.owner_email}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Shows: {displayOptions(e)}
                </p>
                {e.admin_note && (
                  <p className="text-xs text-muted-foreground italic mt-1">
                    Note: {e.admin_note}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {e.status !== "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50 h-7 px-2 text-xs"
                    onClick={() => openAction(e, "approved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Approve
                  </Button>
                )}
                {e.status !== "revoked" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 border-red-200 hover:bg-red-50 h-7 px-2 text-xs"
                    onClick={() => openAction(e, "revoked")}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Revoke
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === "approved" ? "Approve" : "Revoke"} embed
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Product:</strong> {selected.product_name}
              </p>
              <p>
                <strong>Domain:</strong>{" "}
                <span className="font-mono">{selected.domain}</span>
              </p>
              <p>
                <strong>Owner:</strong>{" "}
                {selected.owner_company || selected.owner_email}
              </p>
              <Textarea
                placeholder="Optional admin note (shown to owner)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              variant={action === "approved" ? "default" : "destructive"}
              disabled={updateMut.isPending}
              onClick={() =>
                selected &&
                updateMut.mutate({
                  id: selected.id,
                  body: { status: action, admin_note: note },
                })
              }
            >
              {updateMut.isPending
                ? "Saving…"
                : action === "approved"
                ? "Approve"
                : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
```

- [ ] **Step 5: Wire route in CMS App.tsx**

In `cms/src/App.tsx`, add import:
```tsx
import Embeds from "@/pages/Embeds";
```

Add route inside `<Routes>`, before the catch-all:
```tsx
<Route path="/embeds" element={<ProtectedRoute><Embeds /></ProtectedRoute>} />
```

- [ ] **Step 6: Verify CMS TypeScript build**

```bash
cd /home/rafiur/Desktop/projects/final-review/cms && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 7: End-to-end test**

1. Start backend + CMS dev server
2. Log into CMS as admin
3. Navigate to `/embeds` — sidebar "Embeds" link visible, page loads
4. Create a test embed via the owner dashboard (or insert directly into DB)
5. Pending count badge appears on sidebar
6. Click Approve → badge shows "Approved", pending count drops
7. Log into FE as owner, go to `/owner-embed` → status shows "Approved", snippets visible
8. Copy the script tag snippet, paste into a plain HTML file with a local server; open — badge renders

- [ ] **Step 8: Commit**

```bash
git add cms/src/pages/Embeds.tsx cms/src/App.tsx cms/src/components/Sidebar.tsx \
        cms/src/components/Layout.tsx cms/src/lib/api.ts
git commit -m "feat: CMS embed approval page with pending badge"
```
