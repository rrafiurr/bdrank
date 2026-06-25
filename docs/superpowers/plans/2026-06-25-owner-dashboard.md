# Owner Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an `/owner-dashboard` page in the FE that product owners are redirected to after login, showing all reviews for their products with per-product filtering and pagination, backed by two new authenticated API endpoints.

**Architecture:** Two new backend endpoints (`GET /profile/products`, `GET /owner/reviews`) are added to the existing authenticated Chi router group. The FE adds an `OwnerDashboard` page that fetches from these endpoints via React Query, and updates `Auth.tsx` to redirect verified owners away from the home page.

**Tech Stack:** Go (Chi router, database/sql, MySQL), React 18, TypeScript, TanStack React Query, shadcn/ui, React Router v6.

## Global Constraints

- No test suite exists in this project — skip TDD, use manual curl verification for backend and browser for FE
- All backend handlers follow the pattern in `be/internal/handlers/` — use `writeJSON`/`writeError` from `response.go`, `middleware.UserIDFromCtx` for auth
- Frontend uses `apiFetch` from `fe/src/lib/api.ts` for all API calls (token injected automatically)
- FE components use shadcn/ui from `fe/src/components/ui/` and Tailwind CSS
- Path alias `@/` maps to `fe/src/`
- No new npm packages — use only what's already installed

---

### Task 1: Backend — two new authenticated endpoints

**Files:**
- Modify: `be/internal/handlers/profile.go`
- Modify: `be/internal/repository/product.go`
- Modify: `be/internal/repository/review.go`
- Create: `be/internal/handlers/owner.go`
- Modify: `be/internal/router/router.go`

**Interfaces:**
- Produces:
  - `GET /api/v1/profile/products` → `[{"id":1,"name":"...","category":"..."}]`
  - `GET /api/v1/owner/reviews?product_id=1&limit=20&offset=0` → `{"data":[...reviews],"total":5}`
  - Review shape matches existing `ApiReviewListItem` from FE (same fields as `GET /reviews`)

---

- [ ] **Step 1: Add `MyProducts` to `ProfileHandler`**

Append to `be/internal/handlers/profile.go` (after the last function):

```go
func (h *ProfileHandler) MyProducts(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, name, category FROM products WHERE owner_id = ? ORDER BY name ASC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}
	defer rows.Close()

	type product struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Category string `json:"category"`
	}
	var list []product
	for rows.Next() {
		var p product
		rows.Scan(&p.ID, &p.Name, &p.Category)
		list = append(list, p)
	}
	if list == nil {
		list = []product{}
	}
	writeJSON(w, http.StatusOK, list)
}
```

- [ ] **Step 2: Add `OwnedBy` to `ProductRepo`**

Append to `be/internal/repository/product.go` (after the last function):

```go
// OwnedBy returns true if the product exists and its owner_id matches userID.
func (r *ProductRepo) OwnedBy(ctx context.Context, productID, userID int64) bool {
	var count int
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM products WHERE id = ? AND owner_id = ?`, productID, userID,
	).Scan(&count)
	return count > 0
}
```

- [ ] **Step 3: Add `ListByOwner` to `ReviewRepo`**

Append to `be/internal/repository/review.go` (after the last function, before the `splitImages` helper):

```go
func (r *ReviewRepo) ListByOwner(ctx context.Context, ownerID, productID int64, limit, offset int) ([]*models.Review, int, error) {
	if limit == 0 {
		limit = 20
	}

	conditions := []string{"r.is_approved = 1", "p.owner_id = ?"}
	args := []any{ownerID}
	if productID > 0 {
		conditions = append(conditions, "r.product_id = ?")
		args = append(args, productID)
	}
	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	dataQuery := fmt.Sprintf(`
		SELECT
			r.id, r.title, LEFT(r.content, 200) AS excerpt, r.rating, p.category,
			p.id, p.name,
			u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''),
			COUNT(DISTINCT rl.user_id) AS likes_count,
			COUNT(DISTINCT c.id)       AS comments_count,
			(COUNT(DISTINCT te.id) > 0) AS is_timeline,
			COUNT(DISTINCT te.id)      AS timeline_updates_count,
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			r.created_at, r.is_approved
		FROM reviews r
		INNER JOIN products p ON r.product_id = p.id
		INNER JOIN users u ON r.user_id = u.id
		LEFT JOIN review_likes rl ON r.id = rl.review_id
		LEFT JOIN comments c ON r.id = c.review_id AND c.is_approved = 1
		LEFT JOIN timeline_entries te ON r.id = te.review_id
		LEFT JOIN review_images ri ON r.id = ri.review_id
		%s
		GROUP BY r.id, r.title, r.content, r.rating, p.category,
		         p.id, p.name, u.id, u.username, u.avatar_url, r.created_at, r.is_approved
		ORDER BY r.created_at DESC
		LIMIT ? OFFSET ?`, whereClause)

	rows, err := r.db.QueryContext(ctx, dataQuery, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var reviews []*models.Review
	for rows.Next() {
		var rv models.Review
		var pID int64
		var pName string
		var aID int64
		var username, avatarURL string
		var isTimeline, isApproved int
		var imagesStr sql.NullString

		if err := rows.Scan(
			&rv.ID, &rv.Title, &rv.Excerpt, &rv.Rating, &rv.Category,
			&pID, &pName,
			&aID, &username, &avatarURL,
			&rv.LikesCount, &rv.CommentsCount,
			&isTimeline, &rv.TimelineUpdatesCount,
			&imagesStr, &rv.CreatedAt, &isApproved,
		); err != nil {
			return nil, 0, err
		}
		rv.Product = &models.ProductRef{ID: pID, Name: pName}
		rv.Author = &models.AuthorRef{ID: aID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
		rv.IsTimeline = isTimeline == 1
		rv.IsApproved = isApproved == 1
		rv.Images = absURLSlice(r.baseURL, splitImages(imagesStr))
		reviews = append(reviews, &rv)
	}
	if reviews == nil {
		reviews = []*models.Review{}
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) FROM (
			SELECT r.id
			FROM reviews r
			INNER JOIN products p ON r.product_id = p.id
			%s
			GROUP BY r.id
		) AS sub`, whereClause)
	var total int
	r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)

	return reviews, total, nil
}
```

- [ ] **Step 4: Create `be/internal/handlers/owner.go`**

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
}

func NewOwnerHandler(reviews *repository.ReviewRepo, products *repository.ProductRepo) *OwnerHandler {
	return &OwnerHandler{reviews: reviews, products: products}
}

func (h *OwnerHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

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
```

- [ ] **Step 5: Wire routes in `be/internal/router/router.go`**

After the existing handler instantiations (around line 74), add:

```go
ownerH := handlers.NewOwnerHandler(reviewRepo, productRepo)
```

Inside the authenticated route group (after `r.Get("/profile/comments", profileH.MyComments)`), add:

```go
r.Get("/profile/products", profileH.MyProducts)
r.Get("/owner/reviews", ownerH.ListReviews)
```

- [ ] **Step 6: Build to verify no compile errors**

```bash
cd be && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 7: Verify endpoints with curl**

First, log in as an owner account to get a token:
```bash
curl -s -X POST https://api.bdranks.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"walton@walton.com","password":"12345678"}' | jq .
```

Then test both endpoints (replace `<TOKEN>` with the token from above):
```bash
# Products list
curl -s https://api.bdranks.com/api/v1/profile/products \
  -H 'Authorization: Bearer <TOKEN>' | jq .

# Owner reviews
curl -s 'https://api.bdranks.com/api/v1/owner/reviews?limit=20&offset=0' \
  -H 'Authorization: Bearer <TOKEN>' | jq .
```

Expected: `[]` for products (no products linked yet), `{"data":[],"total":0}` for reviews.

- [ ] **Step 8: Commit**

```bash
git add be/internal/handlers/profile.go \
        be/internal/handlers/owner.go \
        be/internal/repository/product.go \
        be/internal/repository/review.go \
        be/internal/router/router.go
git commit -m "feat: add owner products and reviews endpoints"
```

---

### Task 2: FE — OwnerDashboard page

**Files:**
- Modify: `fe/src/hooks/useAuth.tsx` — add `is_product_owner`, `owner_verified`, `company_name` to `User` type
- Modify: `fe/src/lib/api.ts` — add `ApiOwnerProduct` type
- Create: `fe/src/pages/OwnerDashboard.tsx`
- Modify: `fe/src/App.tsx` — add `/owner-dashboard` route

**Interfaces:**
- Consumes: `GET /profile/products` → `ApiOwnerProduct[]`
- Consumes: `GET /owner/reviews` → `{ data: ApiReviewListItem[], total: number }`
- `user.is_product_owner: boolean`, `user.owner_verified: boolean`, `user.company_name?: string` — added to `User` type in Step 1 of this task

---

- [ ] **Step 1: Extend `User` type in `fe/src/hooks/useAuth.tsx`**

Replace the existing `User` interface:

```ts
export interface User {
  id: number;
  email: string;
  full_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  is_product_owner: boolean;
  owner_verified: boolean;
  company_name?: string;
  created_at: string;
}
```

- [ ] **Step 2: Add `ApiOwnerProduct` type to `fe/src/lib/api.ts`**

Append after the existing `ApiPageListItem` interface:

```ts
export interface ApiOwnerProduct {
  id: number;
  name: string;
  category: string;
}
```

- [ ] **Step 3: Create `fe/src/pages/OwnerDashboard.tsx`**

```tsx
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, Heart, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiReviewListItem, type ApiOwnerProduct } from "@/lib/api";

const PAGE_SIZE = 20;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (user && !user.is_product_owner) navigate("/");
  }, [user, navigate]);

  const { data: products = [] } = useQuery<ApiOwnerProduct[]>({
    queryKey: ["owner-products"],
    queryFn: () => apiFetch<ApiOwnerProduct[]>("/profile/products"),
    enabled: !!user?.is_product_owner,
  });

  const offset = page * PAGE_SIZE;
  const { data, isLoading } = useQuery({
    queryKey: ["owner-reviews", { productId: selectedProduct, offset }],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (selectedProduct !== "all") params.set("product_id", selectedProduct);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(
        `/owner/reviews?${params}`
      );
    },
    enabled: !!user?.is_product_owner && !!user?.owner_verified,
  });

  const reviews = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "—";

  const handleProductChange = (val: string) => {
    setSelectedProduct(val);
    setPage(0);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title={`${user.company_name ?? "Company"} Dashboard`}
        noindex
      />
      <Header />
      <main className="py-12">
        <div className="container px-4 max-w-4xl">
          {/* Header strip */}
          <div className="mb-8">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
              {user.company_name ?? "Company Dashboard"}
            </h1>

            {!user.owner_verified ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Your account is pending admin verification. Reviews will appear
                here once your account is approved.
              </div>
            ) : (
              <div className="flex gap-3 mt-3 flex-wrap">
                <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
                  <span className="text-muted-foreground">Total Reviews</span>
                  <span className="ml-2 font-semibold text-foreground">
                    {total}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
                  <span className="text-muted-foreground">Avg Rating</span>
                  <span className="ml-2 font-semibold text-foreground">
                    {avgRating}
                  </span>
                </div>
              </div>
            )}
          </div>

          {user.owner_verified && (
            <>
              {/* Filter bar */}
              {products.length > 0 && (
                <div className="mb-6">
                  <Select
                    value={selectedProduct}
                    onValueChange={handleProductChange}
                  >
                    <SelectTrigger className="h-9 w-[220px] text-sm rounded-lg">
                      <SelectValue placeholder="All Products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Review list */}
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-14 rounded-lg bg-muted animate-pulse"
                    />
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No reviews yet for this product.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  {reviews.map((review, i) => (
                    <div
                      key={review.id}
                      className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors ${
                        i < reviews.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <Stars rating={review.rating} />
                      <Link
                        to={`/review/${review.id}`}
                        className="flex-1 text-sm font-medium text-foreground hover:text-primary truncate"
                      >
                        {review.title}
                      </Link>
                      {selectedProduct === "all" && (
                        <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                          {review.product.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(review.created_at).toLocaleDateString(
                          "en-US",
                          { year: "numeric", month: "short", day: "numeric" }
                        )}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart className="h-3.5 w-3.5" />
                          {review.likes_count}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {review.comments_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
```

- [ ] **Step 4: Add route in `fe/src/App.tsx`**

Add the import after the existing `OwnerRegister` import:

```tsx
import OwnerDashboard from "./pages/OwnerDashboard";
```

Add the route before the catch-all `*` route:

```tsx
<Route path="/owner-dashboard" element={<OwnerDashboard />} />
```

- [ ] **Step 5: Commit**

```bash
git add fe/src/hooks/useAuth.tsx \
        fe/src/lib/api.ts \
        fe/src/pages/OwnerDashboard.tsx \
        fe/src/App.tsx
git commit -m "feat: add OwnerDashboard page with review list and pagination"
```

---

### Task 3: FE — Redirect owners after login

**Files:**
- Modify: `fe/src/pages/Auth.tsx`

**Interfaces:**
- Consumes: `user.is_product_owner: boolean` from the updated `User` type (Task 2, Step 1)

---

- [ ] **Step 1: Update redirect logic in `fe/src/pages/Auth.tsx`**

Find the existing `useEffect` that watches `user`:

```tsx
useEffect(() => {
  if (user) {
    navigate("/");
  }
}, [user, navigate]);
```

Replace it with:

```tsx
useEffect(() => {
  if (user) {
    navigate(user.is_product_owner ? "/owner-dashboard" : "/");
  }
}, [user, navigate]);
```

- [ ] **Step 2: Verify end-to-end in browser**

1. Navigate to `/auth`
2. Log in with an owner account (e.g. `walton@walton.com`)
3. Confirm redirect lands on `/owner-dashboard`
4. Confirm unverified owners see the pending verification message
5. Log in with a regular user account — confirm redirect goes to `/`
6. With an owner session active, visit `/owner-dashboard` directly — confirm page loads correctly
7. Confirm the product filter dropdown populates once products are linked to the owner in the DB (via admin panel)
8. Confirm pagination controls appear only when `total > 20`

- [ ] **Step 3: Commit**

```bash
git add fe/src/pages/Auth.tsx
git commit -m "feat: redirect product owners to /owner-dashboard after login"
```
