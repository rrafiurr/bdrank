# API curl Examples

Base URL: `http://localhost:8080/api/v1`

Authenticated endpoints require the token from login/register:
```bash
export TOKEN="<paste token here>"
```

---

## 1. Authentication

### Register
```bash
curl -s -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123",
    "full_name": "John Doe"
  }'
```
**Response**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 7,
    "email": "john@example.com",
    "full_name": "John Doe",
    "username": "",
    "bio": "",
    "avatar_url": "",
    "created_at": "2026-06-05T10:00:00Z"
  }
}
```

---

### Login
```bash
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "password123"
  }'
```
**Response**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "alice@example.com",
    "full_name": "Alice Johnson",
    "username": "alice",
    "bio": "Tech reviewer & gadget lover",
    "avatar_url": "https://i.pravatar.cc/150?u=alice",
    "created_at": "2026-06-05T09:49:46Z"
  }
}
```

---

### Get current user (`/auth/me`)
```bash
curl -s http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```
**Response**
```json
{
  "id": 1,
  "email": "alice@example.com",
  "full_name": "Alice Johnson",
  "username": "alice",
  "bio": "Tech reviewer & gadget lover",
  "avatar_url": "https://i.pravatar.cc/150?u=alice",
  "created_at": "2026-06-05T09:49:46Z"
}
```

---

### Logout
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/api/v1/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```
**Response**: `204`

---

## 2. Profile

### Get profile
```bash
curl -s http://localhost:8080/api/v1/profile \
  -H "Authorization: Bearer $TOKEN"
```
**Response**
```json
{
  "id": 1,
  "email": "alice@example.com",
  "full_name": "Alice Johnson",
  "username": "alice",
  "bio": "Tech reviewer & gadget lover",
  "avatar_url": "https://i.pravatar.cc/150?u=alice",
  "created_at": "2026-06-05T09:49:46Z"
}
```

---

### Update profile
```bash
curl -s -X PUT http://localhost:8080/api/v1/profile \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice_reviews",
    "bio": "Tech reviewer, gadget lover & coffee addict",
    "avatar_url": "https://i.pravatar.cc/150?u=alice2"
  }'
```
**Response**: Updated user object (same shape as GET /profile)

---

## 3. File Upload

### Upload image
```bash
curl -s -X POST http://localhost:8080/api/v1/upload/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/photo.jpg"
```
**Response**
```json
{
  "url": "http://localhost:8080/uploads/a3f8c1e2d4b9.jpg"
}
```

---

## 4. Products

### List products (default — sorted by review count)
```bash
curl -s "http://localhost:8080/api/v1/products"
```

### List products — filter by category
```bash
curl -s "http://localhost:8080/api/v1/products?category=physical"
curl -s "http://localhost:8080/api/v1/products?category=digital"
curl -s "http://localhost:8080/api/v1/products?category=service"
```

### List products — sort options
```bash
# Sort by average rating
curl -s "http://localhost:8080/api/v1/products?sort=avg_rating"

# Sort by newest
curl -s "http://localhost:8080/api/v1/products?sort=created_at"
```

### List products — pagination
```bash
curl -s "http://localhost:8080/api/v1/products?limit=3&offset=0"
curl -s "http://localhost:8080/api/v1/products?limit=3&offset=3"
```
**Response**
```json
{
  "data": [
    {
      "id": 1,
      "name": "Sony WH-1000XM5",
      "category": "physical",
      "image_url": "https://images.unsplash.com/photo-...",
      "review_count": 1,
      "avg_rating": 5,
      "created_at": "2026-06-05T09:49:46Z"
    }
  ],
  "total": 10
}
```

---

### Get product by ID
```bash
curl -s "http://localhost:8080/api/v1/products/1"
```
**Response**
```json
{
  "id": 1,
  "name": "Sony WH-1000XM5",
  "category": "physical",
  "image_url": "https://images.unsplash.com/photo-...",
  "review_count": 1,
  "avg_rating": 5,
  "created_at": "2026-06-05T09:49:46Z"
}
```

---

### Category stats
```bash
curl -s "http://localhost:8080/api/v1/categories/stats"
```
**Response**
```json
[
  { "category": "physical", "review_count": 4 },
  { "category": "service",  "review_count": 3 },
  { "category": "digital",  "review_count": 3 }
]
```

---

### List reviews for a product
```bash
curl -s "http://localhost:8080/api/v1/products/2/reviews"

# With sort and pagination
curl -s "http://localhost:8080/api/v1/products/2/reviews?sort=highest&limit=5&offset=0"
curl -s "http://localhost:8080/api/v1/products/2/reviews?sort=most_liked"
```
**Sort values**: `newest` `oldest` `highest` `lowest` `most_liked`

---

## 5. Reviews

### List reviews (default — latest first)
```bash
curl -s "http://localhost:8080/api/v1/reviews"
```

### Filter by category
```bash
curl -s "http://localhost:8080/api/v1/reviews?category=physical"
```

### Full-text search
```bash
curl -s "http://localhost:8080/api/v1/reviews?q=noise+cancelling"
```

### Filter by minimum rating
```bash
curl -s "http://localhost:8080/api/v1/reviews?min_rating=4"
```

### Sort options
```bash
curl -s "http://localhost:8080/api/v1/reviews?sort=popular"   # most liked
curl -s "http://localhost:8080/api/v1/reviews?sort=rating"    # highest rating
curl -s "http://localhost:8080/api/v1/reviews?sort=comments"  # most commented
curl -s "http://localhost:8080/api/v1/reviews?sort=latest"    # newest (default)
```

### Only reviews that have timeline entries
```bash
curl -s "http://localhost:8080/api/v1/reviews?timeline_only=true"
```

### Combined filters with pagination
```bash
curl -s "http://localhost:8080/api/v1/reviews?category=physical&min_rating=4&sort=popular&limit=5&offset=0"
```
**Response**
```json
{
  "data": [
    {
      "id": 1,
      "title": "Best noise-cancelling headphones I have owned",
      "excerpt": "After two weeks of daily use during remote work...",
      "rating": 5,
      "category": "physical",
      "product": { "id": 1, "name": "Sony WH-1000XM5" },
      "author": { "id": 1, "username": "alice", "avatar_url": "https://i.pravatar.cc/150?u=alice" },
      "images": ["https://images.unsplash.com/photo-..."],
      "likes_count": 4,
      "comments_count": 3,
      "is_timeline": false,
      "created_at": "2026-06-05T09:49:46Z"
    }
  ],
  "total": 4
}
```

---

### Get review by ID (full detail with timeline and comments)
```bash
curl -s "http://localhost:8080/api/v1/reviews/5"
```
**Response**
```json
{
  "id": 5,
  "title": "GitHub Copilot: six months in",
  "content": "Copilot has become a genuine pair programmer...",
  "rating": 4,
  "category": "service",
  "product": { "id": 7, "name": "GitHub Copilot", "image_url": "https://..." },
  "author": { "id": 4, "username": "dave", "avatar_url": "https://i.pravatar.cc/150?u=dave" },
  "images": [],
  "likes_count": 3,
  "comments_count": 1,
  "views_count": 1,
  "is_timeline": true,
  "timeline": [
    {
      "id": 1,
      "title": "Month 1 — First impressions",
      "content": "Initially surprised by how often suggestions are correct...",
      "rating": 4,
      "created_at": "2026-06-05T09:49:46Z"
    },
    {
      "id": 2,
      "title": "Month 3 — Productivity plateau",
      "content": "Accepted Copilot completions less often...",
      "rating": 4,
      "created_at": "2026-06-05T09:49:46Z"
    },
    {
      "id": 3,
      "title": "Month 6 — Final verdict",
      "content": "Net positive. The time saved on boilerplate...",
      "rating": 4,
      "created_at": "2026-06-05T09:49:46Z"
    }
  ],
  "comments": [
    {
      "id": 7,
      "content": "Good to hear a nuanced take. Most Copilot reviews are either pure hype or pure FUD.",
      "likes_count": 2,
      "author": { "id": 1, "username": "alice", "avatar_url": "https://i.pravatar.cc/150?u=alice" },
      "created_at": "2026-06-05T09:49:46Z"
    }
  ],
  "created_at": "2026-06-05T09:49:46Z"
}
```

---

### Create review (with images)
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews \
  -H "Authorization: Bearer $TOKEN" \
  -F "product_name=Sony WH-1000XM5" \
  -F "category=physical" \
  -F "title=Still great after two years" \
  -F "content=Bought these two years ago and they are still my go-to headphones for travel and focus work. Battery has degraded slightly to around 25 hours but the ANC remains class-leading." \
  -F "rating=5" \
  -F "images[]=@photo1.jpg" \
  -F "images[]=@photo2.jpg"
```
**Response**: Created review object (full detail)

### Create review (no images)
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews \
  -H "Authorization: Bearer $TOKEN" \
  -F "product_name=Linear" \
  -F "category=service" \
  -F "title=The best issue tracker for small teams" \
  -F "content=We switched from Jira to Linear six months ago and the velocity improvement is real. Fast keyboard-driven UI, sensible defaults, no configuration overhead." \
  -F "rating=5"
```

---

### Increment view count (no auth — call once per page load)
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/api/v1/reviews/1/view
```
**Response**: `204`

---

### Toggle like on a review
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews/1/like \
  -H "Authorization: Bearer $TOKEN"
```
**Response**
```json
{ "liked": true, "likes_count": 5 }
```
Call again to unlike:
```json
{ "liked": false, "likes_count": 4 }
```

---

## 6. Timeline

### Add a timeline entry to a review (author only)
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews/5/timeline \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=One year update" \
  -F "content=Still using Copilot daily. The new GPT-4o model noticeably improved suggestion quality for TypeScript." \
  -F "rating=5"
```

### Add a timeline entry with an image
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews/5/timeline \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Screenshot of a great suggestion" \
  -F "content=Here is an example where it generated an entire typed API client from a comment." \
  -F "rating=5" \
  -F "image=@screenshot.png"
```
**Response**
```json
{
  "id": 5,
  "title": "One year update",
  "content": "Still using Copilot daily...",
  "rating": 5,
  "image_url": "",
  "created_at": "2026-06-05T10:05:00Z"
}
```

---

## 7. Comments

### Post a comment on a review
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews/1/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Thanks for the detailed breakdown — just ordered a pair!" }'
```
**Response**
```json
{
  "id": 10,
  "content": "Thanks for the detailed breakdown — just ordered a pair!",
  "likes_count": 0,
  "author": { "id": 1, "username": "alice", "avatar_url": "https://i.pravatar.cc/150?u=alice" },
  "created_at": "2026-06-05T10:05:00Z"
}
```

---

### Toggle like on a comment
```bash
curl -s -X POST http://localhost:8080/api/v1/reviews/1/comments/1/like \
  -H "Authorization: Bearer $TOKEN"
```
**Response**
```json
{ "liked": true, "likes_count": 4 }
```

---

## 8. Search

### Autocomplete search (min 2 chars)
```bash
curl -s "http://localhost:8080/api/v1/search?q=sony"
```
**Response**
```json
{
  "reviews": [
    { "id": 1, "title": "Best noise-cancelling headphones I have owned", "category": "physical" }
  ],
  "products": [
    { "id": 1, "name": "Sony WH-1000XM5", "category": "physical" }
  ]
}
```

### Search with custom limit
```bash
curl -s "http://localhost:8080/api/v1/search?q=mac&limit=3"
curl -s "http://localhost:8080/api/v1/search?q=aws"
curl -s "http://localhost:8080/api/v1/search?q=no"   # matches Notion, Obsidian
```

---

## End-to-end flow example

```bash
# 1. Login and capture token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 2. Browse latest reviews
curl -s "http://localhost:8080/api/v1/reviews?limit=5" | python3 -m json.tool

# 3. Open a review (increments view count)
curl -s -X POST "http://localhost:8080/api/v1/reviews/1/view"
curl -s "http://localhost:8080/api/v1/reviews/1" | python3 -m json.tool

# 4. Like the review
curl -s -X POST "http://localhost:8080/api/v1/reviews/1/like" \
  -H "Authorization: Bearer $TOKEN"

# 5. Post a comment
curl -s -X POST "http://localhost:8080/api/v1/reviews/1/comments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Great review, very helpful!"}'

# 6. Update your profile
curl -s -X PUT "http://localhost:8080/api/v1/profile" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bio":"New bio text","username":"alice_new"}'

# 7. Logout
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:8080/api/v1/auth/logout" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Error responses

All errors return JSON with an `error` field:

```json
{ "error": "invalid credentials" }        // 401
{ "error": "email already in use" }       // 409
{ "error": "review not found" }           // 404
{ "error": "only the review author..." }  // 403
{ "error": "rating must be between 1 and 5" }  // 400
```

| Code | Meaning |
|------|---------|
| 400  | Bad request / missing fields |
| 401  | Missing or invalid token |
| 403  | Authenticated but not allowed (e.g. not the author) |
| 404  | Resource not found |
| 409  | Conflict (duplicate email) |
| 500  | Internal server error |
