# Owner Dashboard — Design Spec

**Date:** 2026-06-25
**Status:** Approved

## Overview

When a verified product owner logs in via `/auth`, they are redirected to `/owner-dashboard` instead of the home page. This page shows all reviews written against their company's products in descending date order, with a product filter and pagination.

---

## 1. Redirect Logic

**File:** `fe/src/pages/Auth.tsx`

The existing `useEffect` that watches `user` is updated:

```
if user.is_product_owner → navigate("/owner-dashboard")
else                     → navigate("/")
```

Regular users continue to go to `/`. The route `/owner-dashboard` is added to `App.tsx`.

**Unverified owners** (`is_product_owner = true`, `owner_verified = false`) are not blocked at the route level. They reach the page and see a "Your account is pending admin verification" message instead of the review list.

---

## 2. Backend API

Both endpoints sit in the existing **authenticated route group** (`r.Use(mw.Auth(...))`).

### `GET /profile/products`
Returns products owned by the current user. Used to populate the filter dropdown.

**Response:**
```json
[{ "id": 1, "name": "Walton AC", "category": "physical" }]
```

**Implementation:** Query `SELECT id, name, category FROM products WHERE owner_id = ?` with current user ID. Returns empty array if none. Handler goes in `profile.go`.

---

### `GET /owner/reviews`
Returns paginated reviews for all products owned by the current user.

**Query params:**
| Param | Default | Description |
|---|---|---|
| `product_id` | — | Filter to a specific owned product |
| `limit` | 20 | Page size |
| `offset` | 0 | Pagination offset |

**Response:** `{ "data": [...reviews], "total": 123 }` — same shape as existing `GET /reviews` so FE types are reused.

**Ordering:** Always `created_at DESC`.

**Auth guard:** The handler verifies the requested `product_id` (if given) actually belongs to the current user, preventing cross-owner data leakage.

**Implementation:** New handler file `be/internal/handlers/owner.go` + corresponding method on `ReviewRepo` (or inline query). Added to router as:
```
r.Get("/owner/reviews", ownerH.ListReviews)
```

---

## 3. Frontend Page

**Route:** `/owner-dashboard`
**File:** `fe/src/pages/OwnerDashboard.tsx`
**Layout:** Same `<Header />` and `<Footer />` as the rest of the site.

### 3a. Header Strip

Displays:
- Company name (`user.company_name`) as the `<h1>`
- Two stat chips: **Total Reviews** (from `total` in the API response) and **Average Rating** (computed client-side from the first page of loaded reviews — updated as pages change, good enough for now)

### 3b. Filter Bar

A single `<Select>` dropdown:
- "All Products" (default)
- One entry per product returned by `GET /profile/products`

Changing the selection resets offset to 0 and re-fetches reviews.

### 3c. Review List

Compact rows (not `ReviewCard`). Each row contains:

| Element | Detail |
|---|---|
| Star rating | Filled/empty stars, numeric value |
| Title | Clickable link → `/review/:id` |
| Product name | Shown only when "All Products" is selected |
| Date | Formatted `MMM D, YYYY` |
| Likes | Heart icon + count |
| Comments | Chat icon + count |

Skeleton loaders (same pattern as `BrowseReviews`) shown while fetching.

Empty state: "No reviews yet for this product" with a simple illustration/icon.

### 3d. Pagination

Uses the existing shadcn `Pagination` component.
Displays: `← Previous | Page X of Y | Next →`
Page size is fixed at 20. Total pages = `Math.ceil(total / 20)`.

### 3e. Data Fetching

Uses `@tanstack/react-query`:
- Key: `["owner-reviews", { productId, offset }]`
- Key: `["owner-products"]`

Both queries use `apiFetch` with the user's token (already injected by `getToken()` in `api.ts`).

---

## 4. New API Types (fe/src/lib/api.ts)

```ts
export interface ApiOwnerProduct {
  id: number;
  name: string;
  category: string;
}
```

Review list reuses existing `ApiReviewListItem`.

---

## 5. Files Changed

| File | Change |
|---|---|
| `fe/src/pages/Auth.tsx` | Redirect owners to `/owner-dashboard` |
| `fe/src/App.tsx` | Add `/owner-dashboard` route |
| `fe/src/pages/OwnerDashboard.tsx` | New page |
| `fe/src/lib/api.ts` | Add `ApiOwnerProduct` type |
| `be/internal/handlers/owner.go` | New handler: `ListReviews` |
| `be/internal/handlers/profile.go` | Add `MyProducts` handler |
| `be/internal/router/router.go` | Wire up new routes |

---

## 6. Out of Scope (for now)

- Sorting options (user mentioned more ideas coming)
- Reply-to-review from dashboard
- Stats beyond total count and average rating
- Multiple pages of stat aggregation
