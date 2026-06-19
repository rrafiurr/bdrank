# API Requirements

This document lists every backend API endpoint needed to replace the current static/mock data and make the app fully dynamic.

All endpoints should be prefixed with a base URL (e.g. `/api/v1`). Authenticated endpoints require a Bearer token in the `Authorization` header.

---

## 1. Authentication

### `POST /auth/register`
Create a new account.

**Body**
```json
{ "email": "string", "password": "string", "full_name": "string?" }
```
**Response**
```json
{ "token": "string", "user": { "id", "email", "full_name", "created_at" } }
```
**Used by**: `Auth.tsx` (sign-up form)

---

### `POST /auth/login`
Sign in with email and password.

**Body**
```json
{ "email": "string", "password": "string" }
```
**Response**
```json
{ "token": "string", "user": { "id", "email", "full_name", "avatar_url", "created_at" } }
```
**Used by**: `Auth.tsx` (sign-in form)

---

### `POST /auth/logout`
Invalidate the current session token. Authenticated.

**Response**: `204 No Content`

**Used by**: `Header.tsx` (Sign Out button), `useAuth.tsx`

---

### `GET /auth/me`
Return the currently authenticated user. Authenticated.

**Response**
```json
{ "id", "email", "full_name", "avatar_url", "created_at" }
```
**Used by**: `useAuth.tsx` (session restore on app load, currently done via localStorage)

---

## 2. Profile

### `GET /profile`
Get the authenticated user's profile. Authenticated.

**Response**
```json
{ "id", "username", "bio", "avatar_url", "email", "created_at" }
```
**Used by**: `Profile.tsx`

---

### `PUT /profile`
Update the authenticated user's profile. Authenticated.

**Body**
```json
{ "username": "string?", "bio": "string?", "avatar_url": "string?" }
```
**Response**: Updated profile object.

**Used by**: `Profile.tsx` (Save Changes button)

---

## 3. File Upload

### `POST /upload/image`
Upload an image and return its public URL. Authenticated.

**Body**: `multipart/form-data` with field `file` (image/jpeg, image/png, image/webp; max 5 MB for reviews, 10 MB for timeline)

**Response**
```json
{ "url": "string" }
```
**Used by**: `ReviewForm.tsx` (up to 3 images per review), `AddTimeline.tsx` (1 image per timeline entry), `Profile.tsx` (avatar upload — currently accepts a URL string, but will need upload support)

---

## 4. Products

### `GET /products`
List all products. Supports filtering and sorting for the homepage carousels.

**Query params**
| Param | Type | Description |
|---|---|---|
| `category` | `physical \| digital \| service` | Filter by category |
| `sort` | `review_count \| avg_rating \| created_at` | Sort order (default: `review_count`) |
| `limit` | number | Max items (default: 12) |
| `offset` | number | Pagination offset |

**Response**
```json
{
  "data": [
    { "id", "name", "category", "image_url", "review_count", "avg_rating", "created_at" }
  ],
  "total": 42
}
```
**Used by**: `ReviewedProducts.tsx` (horizontal scroll, top 12), `ReviewedProductsGrid.tsx` (grid, top 12 by review count), `Index.tsx`

---

### `GET /products/:id`
Get a single product with its aggregate stats.

**Response**
```json
{ "id", "name", "category", "image_url", "review_count", "avg_rating", "created_at" }
```
**Used by**: `ProductReviews.tsx` (product header section)

---

### `GET /categories/stats`
Return review counts per category (used for the category cards).

**Response**
```json
[
  { "category": "physical", "review_count": 1247 },
  { "category": "service",  "review_count": 892 },
  { "category": "digital",  "review_count": 634 }
]
```
**Used by**: `Categories.tsx` (the hardcoded `count` values on each category card)

---

## 5. Reviews

### `GET /reviews`
List reviews with filtering, sorting, and pagination.

**Query params**
| Param | Type | Description |
|---|---|---|
| `category` | `physical \| digital \| service` | Filter by category |
| `q` | string | Full-text search on title, product name, author username |
| `min_rating` | 1–5 | Minimum star rating |
| `sort` | `latest \| popular \| rating \| comments` | Sort order (default: `latest`) |
| `limit` | number | Default: 20 |
| `offset` | number | Pagination offset |
| `timeline_only` | boolean | If `true`, return only reviews that have timeline entries |

**Response**
```json
{
  "data": [
    {
      "id", "title", "excerpt", "rating", "category",
      "product": { "id", "name" },
      "author": { "id", "username", "avatar_url" },
      "images": ["url"],
      "likes_count", "comments_count",
      "is_timeline": true,
      "timeline_updates_count": 4,
      "created_at"
    }
  ],
  "total": 100
}
```
**Used by**: `BrowseReviews.tsx`, `Index.tsx` (Latest Reviews section), `Categories.tsx` (filtered by category)

---

### `GET /reviews/:id`
Get a single review with full content, timeline entries, and comments.

**Response**
```json
{
  "id", "title", "content", "rating", "category",
  "product": { "id", "name", "image_url" },
  "author": { "id", "username", "avatar_url", "created_at" },
  "images": ["url"],
  "likes_count", "comments_count", "views_count",
  "created_at",
  "timeline": [
    {
      "id", "title", "content", "rating",
      "image_url": "string?",
      "created_at"
    }
  ],
  "comments": [
    {
      "id", "content", "likes_count",
      "author": { "id", "username", "avatar_url" },
      "created_at"
    }
  ]
}
```
**Used by**: `ReviewDetails.tsx`

---

### `GET /products/:id/reviews`
List reviews for a specific product, with sorting.

**Query params**: `sort` (`newest | oldest | highest | lowest | most_liked`), `limit`, `offset`

**Response**: Same shape as `GET /reviews` data array items, without the `product` field.

**Used by**: `ProductReviews.tsx`

---

### `POST /reviews`
Submit a new review. Authenticated.

**Body**: `multipart/form-data`
```
product_name  string   (used to find or create the product)
category      physical | digital | service
title         string
content       string
rating        1–5
images[]      File[]   (up to 3, optional)
```

**Response**: Created review object.

**Used by**: `ReviewForm.tsx` (currently a `TODO` stub with `setTimeout`)

---

### `POST /reviews/:id/like`
Toggle like on a review. Authenticated.

**Response**
```json
{ "liked": true, "likes_count": 157 }
```
**Used by**: `ReviewDetails.tsx` (ThumbsUp button in stats bar)

---

### `POST /reviews/:id/view`
Increment view count. No auth required. Called once per page load.

**Response**: `204 No Content`

**Used by**: `ReviewDetails.tsx` (on mount — views counter is currently hardcoded at 2,847)

---

## 6. Timeline

### `POST /reviews/:id/timeline`
Add a new timeline entry to a review. Authenticated. Only the review author can call this.

**Body**: `multipart/form-data`
```
title    string
content  string
rating   1–5
image    File?  (optional, up to 10 MB)
```

**Response**: The created timeline entry object.

**Used by**: `AddTimeline.tsx` (currently a `TODO` stub)

---

## 7. Comments

### `POST /reviews/:id/comments`
Post a comment on a review. Authenticated.

**Body**
```json
{ "content": "string" }
```
**Response**: Created comment object.

**Used by**: `ReviewDetails.tsx` (Post Comment button — currently no-op)

---

### `POST /reviews/:id/comments/:comment_id/like`
Toggle like on a comment. Authenticated.

**Response**
```json
{ "liked": true, "likes_count": 13 }
```
**Used by**: `ReviewDetails.tsx` (ThumbsUp button on each comment — currently static)

---

## 8. Search

### `GET /search`
Autocomplete / full-text search across reviews and products.

**Query params**
| Param | Type | Description |
|---|---|---|
| `q` | string | Search term (min 2 chars) |
| `limit` | number | Default: 5 |

**Response**
```json
{
  "reviews": [
    { "id", "title", "category" }
  ],
  "products": [
    { "id", "name", "category" }
  ]
}
```
**Used by**: `Header.tsx` (search dropdown — currently uses a hardcoded `mockSuggestions` array and navigates to `/review/:id`)

---

## Summary Table

| # | Method | Endpoint | Auth | Currently Stubbed In |
|---|---|---|---|---|
| 1 | POST | `/auth/register` | — | `useAuth.tsx` |
| 2 | POST | `/auth/login` | — | `useAuth.tsx` |
| 3 | POST | `/auth/logout` | ✓ | `useAuth.tsx` |
| 4 | GET | `/auth/me` | ✓ | `useAuth.tsx` (localStorage) |
| 5 | GET | `/profile` | ✓ | `Profile.tsx` (localStorage) |
| 6 | PUT | `/profile` | ✓ | `Profile.tsx` (localStorage) |
| 7 | POST | `/upload/image` | ✓ | `ReviewForm.tsx`, `AddTimeline.tsx` |
| 8 | GET | `/products` | — | `staticData.ts` |
| 9 | GET | `/products/:id` | — | `staticData.ts` |
| 10 | GET | `/categories/stats` | — | `Categories.tsx` (hardcoded counts) |
| 11 | GET | `/reviews` | — | Inline arrays in `Index.tsx`, `BrowseReviews.tsx`, `Categories.tsx` |
| 12 | GET | `/reviews/:id` | — | `ReviewDetails.tsx` (mockReview object) |
| 13 | GET | `/products/:id/reviews` | — | `staticData.ts` in `ProductReviews.tsx` |
| 14 | POST | `/reviews` | ✓ | `ReviewForm.tsx` (setTimeout stub) |
| 15 | POST | `/reviews/:id/like` | ✓ | `ReviewDetails.tsx` (static number) |
| 16 | POST | `/reviews/:id/view` | — | `ReviewDetails.tsx` (static number) |
| 17 | POST | `/reviews/:id/timeline` | ✓ | `AddTimeline.tsx` (TODO stub) |
| 18 | POST | `/reviews/:id/comments` | ✓ | `ReviewDetails.tsx` (no-op button) |
| 19 | POST | `/reviews/:id/comments/:id/like` | ✓ | `ReviewDetails.tsx` (static number) |
| 20 | GET | `/search` | — | `Header.tsx` (mockSuggestions array) |
