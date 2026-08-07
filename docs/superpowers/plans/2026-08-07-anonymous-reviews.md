# Anonymous Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in user mark an individual review as anonymous, hiding their name and avatar from the public, from product owners, and from the review's own comment thread, while their rewards-level badge still shows.

**Architecture:** A single `reviews.is_anonymous` column. Masking lives in the repository layer and is unconditional there, so any read path that goes through `ReviewRepo` or `CommentRepo` is anonymous-safe by default. The paths that legitimately need the real identity (the CMS in `handlers/admin.go`, the author's own listing in `handlers/profile.go`) already run their own SQL and never touch these repos, so they are unaffected. The API returns `author: null` plus `is_anonymous: true` rather than a literal "Anonymous" string, because the frontend is bilingual and owns the label.

**Tech Stack:** Go 1.22 (chi router, database/sql, MySQL), React 18 + TypeScript + Vite, TanStack Query, shadcn/ui, i18next (en + bn).

## Global Constraints

- Go is **not installed locally**. Every Go command runs through Docker:
  `cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go <cmd>`
- Frontend has **no test suite**. Frontend verification is `cd fe && npm run build` plus `npm run lint`.
- Migrations are plain SQL files in `be/migrations/`, applied manually with `mysql`. They must be re-runnable.
- Every new user-facing string gets a key in **both** `fe/src/locales/en/translation.json` and `fe/src/locales/bn/translation.json`.
- Never serialize the real author of an anonymous review. `AuthorUserID` is tagged `json:"-"` and must stay that way.
- Do **not** modify `be/internal/handlers/admin.go` — admins keep seeing real identities.
- Work on a feature branch. Do not push to `main` (that triggers a production deploy).

### Deviation from the spec, already agreed

The spec describes a `ReviewFilter.RevealIdentity` opt-in flag. This plan omits it: after mapping every call site, nothing needs `reveal=true` (admin and profile use their own SQL). Adding an unused flag is dead code, and masking stays fail-closed without it. If a future caller needs the real author from `ReviewRepo`, add the flag then.

### Spec addendum: `is_mine`

`fe/src/pages/ReviewDetails.tsx:157` computes `isAuthor` as `user.id === review.author.id`, which gates the "Add Timeline" button. With `author: null` that breaks for an author viewing their own anonymous review. Task 7 fixes this with an optional-auth middleware and a server-computed `is_mine` flag, which tells a viewer only about themselves and so leaks nothing.

---

### Task 1: Migration and model fields

**Files:**
- Create: `be/migrations/012_anonymous_reviews.sql`
- Modify: `be/internal/models/models.go:29-49` (Review), `be/internal/models/models.go:84-93` (Comment)

**Interfaces:**
- Consumes: nothing.
- Produces: `models.Review.AuthorUserID int64`, `models.Review.IsAnonymous bool`, `models.Review.IsMine bool`, `models.Comment.AuthorUserID int64`, `models.Comment.IsAnonymous bool`. Column `reviews.is_anonymous TINYINT(1) NOT NULL DEFAULT 0`.

- [ ] **Step 1: Write the migration**

Create `be/migrations/012_anonymous_reviews.sql`:

```sql
-- Per-review anonymity. The review keeps its user_id: anonymity is a display
-- property, so rewards, the author's own profile listing, and moderation all
-- keep working. Only the public-facing author identity is suppressed.

-- MySQL has no ADD COLUMN IF NOT EXISTS, so guard via information_schema to
-- keep this file re-runnable (same pattern as 011_categories.sql).
SET @db := DATABASE();

SET @needs := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='reviews' AND COLUMN_NAME='is_anonymous');
SET @sql := IF(@needs,
    "ALTER TABLE reviews ADD COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0",
    "DO 0");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
```

- [ ] **Step 2: Apply the migration**

Run (substitute your DB name and credentials):

```bash
mysql -u root -p "$DB_NAME" < be/migrations/012_anonymous_reviews.sql
```

Verify:

```bash
mysql -u root -p "$DB_NAME" -e "SHOW COLUMNS FROM reviews LIKE 'is_anonymous'"
```

Expected: one row, `Type: tinyint(1)`, `Null: NO`, `Default: 0`.

- [ ] **Step 3: Run it a second time**

Run the same `mysql < ...` command again.
Expected: no error, no duplicate-column failure. This proves it is re-runnable.

- [ ] **Step 4: Add the model fields**

In `be/internal/models/models.go`, replace the `Author` line in `Review` and add three fields. The `omitempty` tag is deliberately dropped so a masked review serializes as an explicit `"author": null` instead of omitting the key, matching `Comment` and giving the frontend one shape to handle:

```go
type Review struct {
	ID                   int64           `json:"id"`
	Title                string          `json:"title"`
	Content              string          `json:"content,omitempty"`
	Excerpt              string          `json:"excerpt,omitempty"`
	Rating               int             `json:"rating"`
	Category             string          `json:"category"`
	IsApproved           bool            `json:"is_approved"`
	Product              *ProductRef     `json:"product,omitempty"`
	Author               *AuthorRef      `json:"author"`
	// AuthorUserID is the real author, always populated even when Author has
	// been masked. Never serialized — badge decoration and ownership checks
	// need it, clients must not see it.
	AuthorUserID         int64           `json:"-"`
	// IsAnonymous means the author chose to hide their identity on this review.
	IsAnonymous          bool            `json:"is_anonymous"`
	// IsMine is set per-viewer by the handler, never by the repository.
	IsMine               bool            `json:"is_mine"`
	AuthorBadge          *Badge          `json:"author_badge,omitempty"`
	Images               []string        `json:"images"`
	LikesCount           int             `json:"likes_count"`
	CommentsCount        int             `json:"comments_count"`
	ViewsCount           int             `json:"views_count"`
	IsTimeline           bool            `json:"is_timeline"`
	TimelineUpdatesCount int             `json:"timeline_updates_count,omitempty"`
	Timeline             []TimelineEntry `json:"timeline,omitempty"`
	Comments             []Comment       `json:"comments,omitempty"`
	CreatedAt            time.Time       `json:"created_at"`
}
```

And in `Comment`:

```go
type Comment struct {
	ID           int64      `json:"id"`
	Content      string     `json:"content"`
	LikesCount   int        `json:"likes_count"`
	Author       *AuthorRef `json:"author"`
	// AuthorUserID mirrors Review.AuthorUserID: real author, never serialized.
	AuthorUserID int64      `json:"-"`
	// IsAnonymous is true only for the review author's own comments on a
	// review they posted anonymously.
	IsAnonymous  bool       `json:"is_anonymous"`
	AuthorBadge  *Badge     `json:"author_badge,omitempty"`
	IsOwnerReply bool       `json:"is_owner_reply"`
	CompanyName  string     `json:"company_name,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}
```

- [ ] **Step 5: Verify it compiles**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go build ./...
```

Expected: no output (success).

- [ ] **Step 6: Commit**

```bash
git add be/migrations/012_anonymous_reviews.sql be/internal/models/models.go
git commit -m "feat(reviews): is_anonymous column and model fields"
```

---

### Task 2: Pure masking helpers

The masking logic is extracted into pure functions so it can be unit-tested without a database — the repo has no DB test harness, and every existing test is pure logic.

**Files:**
- Create: `be/internal/repository/anonymity.go`
- Test: `be/internal/repository/anonymity_test.go`

**Interfaces:**
- Consumes: `models.Review`, `models.Comment` from Task 1.
- Produces: `maskReviewAuthor(rv *models.Review)` and `maskCommentAuthors(comments []models.Comment, reviewAuthorID int64, reviewIsAnonymous bool)`, both package-private to `repository`.

- [ ] **Step 1: Write the failing test**

Create `be/internal/repository/anonymity_test.go`:

```go
package repository

import (
	"testing"

	"final-review/be/internal/models"
)

func TestMaskReviewAuthorHidesAnonymous(t *testing.T) {
	rv := &models.Review{
		IsAnonymous:  true,
		AuthorUserID: 7,
		Author:       &models.AuthorRef{ID: 7, Username: "rafiur", AvatarURL: "/a.png"},
	}
	maskReviewAuthor(rv)

	if rv.Author != nil {
		t.Fatalf("Author = %+v, want nil", rv.Author)
	}
	if rv.AuthorUserID != 7 {
		t.Fatalf("AuthorUserID = %d, want 7 (badge decoration needs it)", rv.AuthorUserID)
	}
}

func TestMaskReviewAuthorLeavesPublicReview(t *testing.T) {
	rv := &models.Review{
		IsAnonymous:  false,
		AuthorUserID: 7,
		Author:       &models.AuthorRef{ID: 7, Username: "rafiur"},
	}
	maskReviewAuthor(rv)

	if rv.Author == nil || rv.Author.Username != "rafiur" {
		t.Fatalf("Author = %+v, want the real author untouched", rv.Author)
	}
}

func TestMaskCommentAuthorsHidesOnlyTheReviewAuthor(t *testing.T) {
	comments := []models.Comment{
		{ID: 1, AuthorUserID: 7, Author: &models.AuthorRef{ID: 7, Username: "rafiur"}},
		{ID: 2, AuthorUserID: 9, Author: &models.AuthorRef{ID: 9, Username: "someone"}},
	}
	maskCommentAuthors(comments, 7, true)

	if comments[0].Author != nil {
		t.Fatalf("review author's own comment: Author = %+v, want nil", comments[0].Author)
	}
	if !comments[0].IsAnonymous {
		t.Fatal("review author's own comment: IsAnonymous = false, want true")
	}
	if comments[1].Author == nil || comments[1].Author.Username != "someone" {
		t.Fatalf("third party comment: Author = %+v, want untouched", comments[1].Author)
	}
	if comments[1].IsAnonymous {
		t.Fatal("third party comment: IsAnonymous = true, want false")
	}
}

func TestMaskCommentAuthorsNoopOnPublicReview(t *testing.T) {
	comments := []models.Comment{
		{ID: 1, AuthorUserID: 7, Author: &models.AuthorRef{ID: 7, Username: "rafiur"}},
	}
	maskCommentAuthors(comments, 7, false)

	if comments[0].Author == nil || comments[0].Author.Username != "rafiur" {
		t.Fatalf("Author = %+v, want untouched on a public review", comments[0].Author)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./internal/repository/ -run TestMask -v
```

Expected: FAIL — `undefined: maskReviewAuthor`, `undefined: maskCommentAuthors`.

- [ ] **Step 3: Write the implementation**

Create `be/internal/repository/anonymity.go`:

```go
package repository

import "final-review/be/internal/models"

// maskReviewAuthor drops the public identity of an anonymous review. It is the
// single choke point for review anonymity, applied unconditionally on every
// ReviewRepo read path, so a read path added later is anonymous-safe by
// default. Callers that legitimately need the real author (the CMS in
// handlers/admin.go, the author's own listing in handlers/profile.go) run
// their own SQL and never reach this code.
//
// AuthorUserID survives masking: it is never serialized (json:"-") and badge
// decoration and ownership checks both need it.
func maskReviewAuthor(rv *models.Review) {
	if rv == nil || !rv.IsAnonymous {
		return
	}
	rv.Author = nil
}

// maskCommentAuthors hides the review author's own comments on a review they
// posted anonymously. Without it, a single reply under their real name in
// their own thread defeats the anonymity of the review above it. Comments by
// anyone else — including verified product-owner replies, who are never the
// review's author — are left untouched.
func maskCommentAuthors(comments []models.Comment, reviewAuthorID int64, reviewIsAnonymous bool) {
	if !reviewIsAnonymous {
		return
	}
	for i := range comments {
		if comments[i].AuthorUserID == reviewAuthorID {
			comments[i].Author = nil
			comments[i].IsAnonymous = true
		}
	}
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./internal/repository/ -run TestMask -v
```

Expected: PASS — four tests, `ok final-review/be/internal/repository`.

- [ ] **Step 5: Commit**

```bash
git add be/internal/repository/anonymity.go be/internal/repository/anonymity_test.go
git commit -m "feat(reviews): pure author-masking helpers with tests"
```

---

### Task 3: Mask the review read paths

**Files:**
- Modify: `be/internal/repository/review.go:32-155` (`List`), `:158-255` (`FindByID`), `:329-415` (`ListByOwner`)
- Modify: `be/internal/handlers/reviews.go:50-70` and `:73-95` (badge decorators)

**Interfaces:**
- Consumes: `maskReviewAuthor` from Task 2; `Review.AuthorUserID`, `Review.IsAnonymous` from Task 1.
- Produces: `ReviewRepo.List`, `FindByID`, and `ListByOwner` return masked authors for anonymous reviews, with `AuthorUserID` populated. Signatures are unchanged.

- [ ] **Step 1: Add `is_anonymous` to the `List` query**

In `be/internal/repository/review.go`, in `List`'s `dataQuery`, add the column to the SELECT list — change the trailing line:

```go
			COALESCE(r.created_at, NOW()), r.is_approved
```

to:

```go
			COALESCE(r.created_at, NOW()), r.is_approved, r.is_anonymous
```

and add it to the GROUP BY — change:

```go
		GROUP BY r.id, r.title, r.content, r.rating, p.category, p.id, p.name,
		         u.id, u.username, u.avatar_url, r.created_at, r.is_approved
```

to:

```go
		GROUP BY r.id, r.title, r.content, r.rating, p.category, p.id, p.name,
		         u.id, u.username, u.avatar_url, r.created_at, r.is_approved,
		         r.is_anonymous
```

- [ ] **Step 2: Fix the username search leak in `List`**

Still in `List`, at `be/internal/repository/review.go:50`, change:

```go
		conditions = append(conditions, "(r.title LIKE ? OR p.name LIKE ? OR u.username LIKE ?)")
```

to:

```go
		// The username match is scoped to non-anonymous reviews: without this,
		// searching a person's name would list the very reviews they asked to
		// have their name removed from.
		conditions = append(conditions, "(r.title LIKE ? OR p.name LIKE ? OR (u.username LIKE ? AND r.is_anonymous = 0))")
```

The `countQuery` in `List` reuses the same `whereClause` and `args`, so it picks this up with no further change.

- [ ] **Step 3: Scan and mask in `List`**

In `List`'s row loop, change the declarations:

```go
		var isTimeline, isApproved int
```

to:

```go
		var isTimeline, isApproved, isAnon int
```

change the `rows.Scan` call's last line:

```go
			&imagesStr, &rv.CreatedAt, &isApproved,
```

to:

```go
			&imagesStr, &rv.CreatedAt, &isApproved, &isAnon,
```

and change the author assignment:

```go
		rv.Author = &models.AuthorRef{ID: authorID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
```

to:

```go
		rv.AuthorUserID = authorID
		rv.IsAnonymous = isAnon == 1
		rv.Author = &models.AuthorRef{ID: authorID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
		maskReviewAuthor(&rv)
```

- [ ] **Step 4: Do the same in `FindByID`**

In `FindByID`, add `r.is_anonymous` to the SELECT — change:

```go
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			r.is_approved
```

to:

```go
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			r.is_approved, r.is_anonymous
```

add it to the GROUP BY — change:

```go
		GROUP BY r.id, r.title, r.content, r.rating, p.category, r.views_count,
		         p.id, p.name, p.image_url, u.id, u.username, u.avatar_url, r.is_approved`, id,
```

to:

```go
		GROUP BY r.id, r.title, r.content, r.rating, p.category, r.views_count,
		         p.id, p.name, p.image_url, u.id, u.username, u.avatar_url,
		         r.is_approved, r.is_anonymous`, id,
```

change the declaration:

```go
	var isTimeline, isApproved int
```

to:

```go
	var isTimeline, isApproved, isAnon int
```

and the `.Scan` last line:

```go
		&rv.LikesCount, &rv.CommentsCount, &isTimeline, &imagesStr, &isApproved,
```

to:

```go
		&rv.LikesCount, &rv.CommentsCount, &isTimeline, &imagesStr, &isApproved, &isAnon,
```

Then set the fields. Change:

```go
	rv.Author = &models.AuthorRef{ID: authorID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
	rv.IsApproved = isApproved == 1
```

to:

```go
	rv.AuthorUserID = authorID
	rv.IsAnonymous = isAnon == 1
	rv.Author = &models.AuthorRef{ID: authorID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
	rv.IsApproved = isApproved == 1
```

Do **not** call `maskReviewAuthor` here yet — `FindByID` also loads comments, and Task 4 adds the comment masking that must run before it. Task 4 adds the call at the end of the function.

- [ ] **Step 5: Do the same in `ListByOwner`**

Product owners do not see through anonymity, so this path masks exactly like the public one.

In `ListByOwner`'s `dataQuery`, change:

```go
			COALESCE(r.created_at, NOW()), r.is_approved
```

to:

```go
			COALESCE(r.created_at, NOW()), r.is_approved, r.is_anonymous
```

change the GROUP BY:

```go
		GROUP BY r.id, r.title, r.content, r.rating, p.category,
		         p.id, p.name, u.id, u.username, u.avatar_url, r.created_at, r.is_approved
```

to:

```go
		GROUP BY r.id, r.title, r.content, r.rating, p.category,
		         p.id, p.name, u.id, u.username, u.avatar_url, r.created_at,
		         r.is_approved, r.is_anonymous
```

change the declaration:

```go
		var isTimeline, isApproved int
```

to:

```go
		var isTimeline, isApproved, isAnon int
```

the `rows.Scan` last line:

```go
			&imagesStr, &rv.CreatedAt, &isApproved,
```

to:

```go
			&imagesStr, &rv.CreatedAt, &isApproved, &isAnon,
```

and the author assignment:

```go
		rv.Author = &models.AuthorRef{ID: aID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
```

to:

```go
		rv.AuthorUserID = aID
		rv.IsAnonymous = isAnon == 1
		rv.Author = &models.AuthorRef{ID: aID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
		maskReviewAuthor(&rv)
```

- [ ] **Step 6: Switch badge decoration to `AuthorUserID`**

`decorateReviewBadges` reads `rv.Author.ID`, which is now `nil` for anonymous reviews — the badge would silently disappear, and the whole point is that it stays. In `be/internal/handlers/reviews.go`, replace both decorator functions:

```go
// decorateReviewBadges is best-effort: a failure to fetch levels never fails
// the request, it just leaves AuthorBadge unset.
//
// It keys off AuthorUserID rather than Author.ID so an anonymous review still
// shows its author's level badge — hiding the identity, not the standing.
func decorateReviewBadges(r *http.Request, rw *rewards.Service, reviews []*models.Review) {
	ids := make([]int64, 0, len(reviews))
	for _, rv := range reviews {
		if rv.AuthorUserID != 0 {
			ids = append(ids, rv.AuthorUserID)
		}
	}
	badges, err := rw.LevelsForUsers(r.Context(), ids)
	if err != nil {
		log.Printf("WARN LevelsForUsers (reviews): %v", err)
		return
	}
	for _, rv := range reviews {
		if lvl, ok := badges[rv.AuthorUserID]; ok {
			rv.AuthorBadge = &models.Badge{Name: lvl.Name, Icon: lvl.Icon, Color: lvl.Color}
		}
	}
}

// decorateCommentBadges is best-effort: a failure to fetch levels never fails
// the request, it just leaves AuthorBadge unset. Like decorateReviewBadges it
// keys off AuthorUserID so masked comments keep their badge.
func decorateCommentBadges(r *http.Request, rw *rewards.Service, comments []models.Comment) {
	ids := make([]int64, 0, len(comments))
	for _, cm := range comments {
		if cm.AuthorUserID != 0 {
			ids = append(ids, cm.AuthorUserID)
		}
	}
	badges, err := rw.LevelsForUsers(r.Context(), ids)
	if err != nil {
		log.Printf("WARN LevelsForUsers (comments): %v", err)
		return
	}
	for i := range comments {
		if lvl, ok := badges[comments[i].AuthorUserID]; ok {
			comments[i].AuthorBadge = &models.Badge{Name: lvl.Name, Icon: lvl.Icon, Color: lvl.Color}
		}
	}
}
```

- [ ] **Step 7: Build and run the full test suite**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go build ./... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./...
```

Expected: build succeeds; tests pass (`ok final-review/be/internal/repository`, `ok final-review/be/internal/rewards`).

- [ ] **Step 8: Verify against a running server**

Start the API (`cd be && make dev`), then flip one existing approved review to anonymous and check the public response:

```bash
mysql -u root -p "$DB_NAME" -e "UPDATE reviews SET is_anonymous = 1 WHERE id = (SELECT id FROM (SELECT MIN(id) AS id FROM reviews WHERE is_approved = 1) x)"
curl -s "http://localhost:8080/api/v1/reviews?limit=50" | grep -o '"is_anonymous":true' | head -1
curl -s "http://localhost:8080/api/v1/reviews?limit=50" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; a=[r for r in d if r['is_anonymous']]; print(a[0]['author'], a[0].get('author_badge'))"
```

Expected: `author` prints `None` and `author_badge` prints the badge dict (or `None` if that user has no level yet — confirm with a user who does).

Then confirm the search leak is closed. Look up that review's author username and search for it:

```bash
mysql -u root -p "$DB_NAME" -e "SELECT u.username FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.is_anonymous = 1 LIMIT 1"
curl -s "http://localhost:8080/api/v1/reviews?q=<THAT_USERNAME>" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print([r['id'] for r in d if r['is_anonymous']])"
```

Expected: an empty list — searching the name must not return their anonymous reviews. Their non-anonymous reviews should still appear in the unfiltered `data`.

- [ ] **Step 9: Commit**

```bash
git add be/internal/repository/review.go be/internal/handlers/reviews.go
git commit -m "feat(reviews): mask author on anonymous reviews in all repo read paths"
```

---

### Task 4: Mask the review author's own comments

**Files:**
- Modify: `be/internal/repository/review.go:222-252` (the comments query inside `FindByID`)
- Modify: `be/internal/repository/comment.go:19-41` (`Create`)

**Interfaces:**
- Consumes: `maskCommentAuthors` from Task 2; `Review.AuthorUserID` / `Review.IsAnonymous` set in Task 3.
- Produces: `Comment.AuthorUserID` populated on both comment read paths; the review author's own comments masked.

- [ ] **Step 1: Populate `AuthorUserID` and mask in `FindByID`'s comment loop**

In `be/internal/repository/review.go`, inside `FindByID`, change:

```go
			cm.Author = &models.AuthorRef{ID: aID, Username: aUsername, AvatarURL: absURL(r.baseURL, aAvatarURL)}
			cm.IsOwnerReply = isOwnerReply == 1
```

to:

```go
			cm.AuthorUserID = aID
			cm.Author = &models.AuthorRef{ID: aID, Username: aUsername, AvatarURL: absURL(r.baseURL, aAvatarURL)}
			cm.IsOwnerReply = isOwnerReply == 1
```

- [ ] **Step 2: Apply both masks at the end of `FindByID`**

Still in `FindByID`, change the tail of the function:

```go
	if rv.Comments == nil {
		rv.Comments = []models.Comment{}
	}

	return &rv, nil
}
```

to:

```go
	if rv.Comments == nil {
		rv.Comments = []models.Comment{}
	}

	// Order matters only in that both run before returning: the comment mask
	// needs rv.AuthorUserID, which maskReviewAuthor leaves intact.
	maskCommentAuthors(rv.Comments, rv.AuthorUserID, rv.IsAnonymous)
	maskReviewAuthor(&rv)

	return &rv, nil
}
```

- [ ] **Step 3: Mask the just-posted comment in `CommentRepo.Create`**

A comment posted by the review's author on their own anonymous review must come back masked, or the poster's name flashes into the thread on the optimistic render. In `be/internal/repository/comment.go`, replace the body of `Create` after the INSERT:

```go
	var cm models.Comment
	var aID, reviewAuthorID int64
	var username, avatarURL string
	var reviewIsAnon int
	err = r.db.QueryRowContext(ctx, `
		SELECT c.id, c.content, 0, u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''), c.created_at,
		       rv.user_id, rv.is_anonymous
		FROM comments c
		INNER JOIN users u ON c.user_id = u.id
		INNER JOIN reviews rv ON rv.id = c.review_id
		WHERE c.id = ?`, id,
	).Scan(&cm.ID, &cm.Content, &cm.LikesCount, &aID, &username, &avatarURL, &cm.CreatedAt,
		&reviewAuthorID, &reviewIsAnon)
	if err != nil {
		return nil, err
	}
	cm.AuthorUserID = aID
	cm.Author = &models.AuthorRef{ID: aID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}

	// A one-element slice so the same masking rule applies here as in the
	// thread listing — one implementation, not two.
	out := []models.Comment{cm}
	maskCommentAuthors(out, reviewAuthorID, reviewIsAnon == 1)
	return &out[0], nil
}
```

- [ ] **Step 4: Build and test**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go build ./... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./...
```

Expected: build succeeds, all tests pass.

- [ ] **Step 5: Verify against a running server**

With the API running and using the anonymous review id from Task 3 Step 8, post a comment as the review's author and as a different user, then fetch the detail:

```bash
curl -s "http://localhost:8080/api/v1/reviews/<ANON_REVIEW_ID>" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); [print(c['id'], c['author'], c['is_anonymous']) for c in d.get('comments',[])]"
```

Expected: the review author's comment prints `None True`; the other user's comment prints their author dict and `False`.

- [ ] **Step 6: Commit**

```bash
git add be/internal/repository/review.go be/internal/repository/comment.go
git commit -m "feat(reviews): mask the review author's own comments on anonymous reviews"
```

---

### Task 5: Accept `is_anonymous` when creating a review

**Files:**
- Modify: `be/internal/repository/review.go:257-267` (`Create`)
- Modify: `be/internal/handlers/reviews.go:115-217` (`Create`)

**Interfaces:**
- Consumes: the `reviews.is_anonymous` column from Task 1.
- Produces: `ReviewRepo.Create(ctx context.Context, userID, productID int64, title, content string, rating int, isAnonymous bool) (int64, error)` — note the new trailing parameter.

- [ ] **Step 1: Add the parameter to the repository**

In `be/internal/repository/review.go`, replace `Create`:

```go
func (r *ReviewRepo) Create(ctx context.Context, userID, productID int64, title, content string, rating int, isAnonymous bool) (int64, error) {
	anon := 0
	if isAnonymous {
		anon = 1
	}
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reviews (user_id, product_id, title, content, rating, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)`,
		userID, productID, title, content, rating, anon,
	)
```

Leave the rest of the function (the `LastInsertId` handling) as it is.

- [ ] **Step 2: Read the form field in the handler**

In `be/internal/handlers/reviews.go`, in `Create`, immediately after the `rating` validation block, add:

```go
	// Absent or "false"/"0" means a normal, attributed review — anonymity is
	// always an explicit opt-in.
	isAnonymous := r.FormValue("is_anonymous") == "true" || r.FormValue("is_anonymous") == "1"
```

Then change the call:

```go
	reviewID, err := h.reviews.Create(r.Context(), userID, productID, title, content, rating)
```

to:

```go
	reviewID, err := h.reviews.Create(r.Context(), userID, productID, title, content, rating, isAnonymous)
```

Rewards are deliberately untouched: an anonymous review still earns points and counts toward the leaderboard, which leaks nothing because the leaderboard shows totals, not which reviews produced them.

- [ ] **Step 3: Build and test**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go build ./... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./...
```

Expected: build succeeds, all tests pass.

- [ ] **Step 4: Verify with curl**

With the API running and a valid `$TOKEN`:

```bash
curl -s -X POST http://localhost:8080/api/v1/reviews \
  -H "Authorization: Bearer $TOKEN" \
  -F "title=Anon test" -F "content=Testing anonymity" -F "rating=4" \
  -F "product_name=Test Product" -F "category=physical" \
  -F "is_anonymous=true"
mysql -u root -p "$DB_NAME" -e "SELECT id, title, is_anonymous FROM reviews ORDER BY id DESC LIMIT 1"
```

Expected: the new row has `is_anonymous = 1`. Repeat without the `is_anonymous` field and confirm the next row has `0`.

- [ ] **Step 5: Commit**

```bash
git add be/internal/repository/review.go be/internal/handlers/reviews.go
git commit -m "feat(reviews): accept is_anonymous on review creation"
```

---

### Task 6: Anonymity toggle endpoint

**Files:**
- Modify: `be/internal/repository/review.go` (add `SetAnonymous` after `IsAuthor`, around line 327)
- Modify: `be/internal/handlers/reviews.go` (add `SetAnonymity` handler at the end of the file)
- Modify: `be/internal/handlers/profile.go:35-70` (`MyReviews`)
- Modify: `be/internal/router/router.go:171-175`

**Interfaces:**
- Consumes: `ReviewRepo.IsAuthor(ctx, reviewID, userID int64) bool` (already exists at `review.go:323`).
- Produces: `ReviewRepo.SetAnonymous(ctx context.Context, reviewID int64, anonymous bool) error`; `PATCH /api/v1/reviews/{id}/anonymity`; `GET /profile/reviews` rows gain `is_anonymous`.

- [ ] **Step 1: Add the repository method**

In `be/internal/repository/review.go`, directly after `IsAuthor`, add:

```go
// SetAnonymous flips the anonymity flag on a single review. Authorization is
// the caller's job — see ReviewHandler.SetAnonymity.
func (r *ReviewRepo) SetAnonymous(ctx context.Context, reviewID int64, anonymous bool) error {
	anon := 0
	if anonymous {
		anon = 1
	}
	_, err := r.db.ExecContext(ctx, `UPDATE reviews SET is_anonymous = ? WHERE id = ?`, anon, reviewID)
	return err
}
```

- [ ] **Step 2: Add the handler**

At the end of `be/internal/handlers/reviews.go`, add:

```go
// SetAnonymity handles PATCH /reviews/{id}/anonymity — the author toggling
// their own review between anonymous and attributed.
//
// Note that turning anonymity off is not truly reversible: anyone who has
// already seen the name, and any search engine that indexed the page, keeps
// it. The client warns about that before calling this with false.
func (h *ReviewHandler) SetAnonymity(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	userID := middleware.UserIDFromCtx(r.Context())

	if !h.reviews.Exists(r.Context(), id) {
		writeError(w, http.StatusNotFound, "review not found")
		return
	}
	if !h.reviews.IsAuthor(r.Context(), id, userID) {
		writeError(w, http.StatusForbidden, "not your review")
		return
	}

	var body struct {
		IsAnonymous *bool `json:"is_anonymous"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.IsAnonymous == nil {
		writeError(w, http.StatusBadRequest, "is_anonymous is required")
		return
	}

	if err := h.reviews.SetAnonymous(r.Context(), id, *body.IsAnonymous); err != nil {
		log.Printf("ERROR SetAnonymous reviewID=%d userID=%d: %v", id, userID, err)
		writeError(w, http.StatusInternalServerError, "failed to update review")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"is_anonymous": *body.IsAnonymous})
}
```

Add `"encoding/json"` to the import block at the top of the file.

- [ ] **Step 3: Register the route**

In `be/internal/router/router.go`, inside the authenticated group, after the `r.Post("/reviews/{id}/like", ...)` line, add:

```go
			r.Patch("/reviews/{id}/anonymity", reviewH.SetAnonymity)
```

- [ ] **Step 4: Return `is_anonymous` from the profile listing**

The profile page is where the toggle lives, so it needs the current state. In `be/internal/handlers/profile.go`, in `MyReviews`, change the query:

```go
		SELECT r.id, r.title, r.rating, r.is_approved, p.name AS product, r.created_at
```

to:

```go
		SELECT r.id, r.title, r.rating, r.is_approved, p.name AS product, r.created_at, r.is_anonymous
```

change the `row` struct to add the field after `IsApproved`:

```go
	type row struct {
		ID          int64     `json:"id"`
		Title       string    `json:"title"`
		Rating      int       `json:"rating"`
		IsApproved  bool      `json:"is_approved"`
		IsAnonymous bool      `json:"is_anonymous"`
		Product     string    `json:"product"`
		CreatedAt   time.Time `json:"created_at"`
	}
```

and change the scan loop:

```go
	for rows.Next() {
		var rv row
		var approved int
		rows.Scan(&rv.ID, &rv.Title, &rv.Rating, &approved, &rv.Product, &rv.CreatedAt)
		rv.IsApproved = approved == 1
		list = append(list, rv)
	}
```

to:

```go
	for rows.Next() {
		var rv row
		var approved, anon int
		rows.Scan(&rv.ID, &rv.Title, &rv.Rating, &approved, &rv.Product, &rv.CreatedAt, &anon)
		rv.IsApproved = approved == 1
		rv.IsAnonymous = anon == 1
		list = append(list, rv)
	}
```

This listing intentionally keeps showing the user their own reviews — it is their own identity, not someone else's.

- [ ] **Step 5: Build and test**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go build ./... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./...
```

Expected: build succeeds, all tests pass.

- [ ] **Step 6: Verify authorization with curl**

With the API running, `$TOKEN` for the review's author and `$OTHER_TOKEN` for a different user:

```bash
# author can toggle
curl -s -X PATCH "http://localhost:8080/api/v1/reviews/$RID/anonymity" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"is_anonymous":true}'
# a stranger cannot
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH "http://localhost:8080/api/v1/reviews/$RID/anonymity" \
  -H "Authorization: Bearer $OTHER_TOKEN" -H "Content-Type: application/json" \
  -d '{"is_anonymous":false}'
# the flag round-trips to the profile listing
curl -s "http://localhost:8080/api/v1/profile/reviews" -H "Authorization: Bearer $TOKEN" | head -c 400
```

Expected: first prints `{"is_anonymous":true}`; second prints `403`; third shows `"is_anonymous":true` on that review.

- [ ] **Step 7: Commit**

```bash
git add be/internal/repository/review.go be/internal/handlers/reviews.go be/internal/handlers/profile.go be/internal/router/router.go
git commit -m "feat(reviews): PATCH /reviews/{id}/anonymity toggle endpoint"
```

---

### Task 7: Optional auth and `is_mine` on review detail

Without this, an author viewing their own anonymous review loses the "Add Timeline" button, because the frontend derives ownership from `review.author.id`, which is now `null`.

**Files:**
- Modify: `be/internal/middleware/auth.go` (add `OptionalAuth` after `Auth`)
- Modify: `be/internal/handlers/reviews.go:96-111` (`GetByID`)
- Modify: `be/internal/router/router.go:131`

**Interfaces:**
- Consumes: `Review.AuthorUserID`, `Review.IsMine` from Task 1.
- Produces: `middleware.OptionalAuth(cfg *config.Config, rdb *redis.Client) func(http.Handler) http.Handler`; `GET /reviews/{id}` responses carry `is_mine`.

- [ ] **Step 1: Add the optional-auth middleware**

In `be/internal/middleware/auth.go`, after `Auth`, add:

```go
// OptionalAuth validates a Bearer token when one is present and otherwise lets
// the request through unauthenticated. Public endpoints use it when part of
// the response depends on who is asking — for example whether a review belongs
// to the viewer — but the endpoint must stay readable to logged-out visitors.
//
// A bad or expired token is treated as no token rather than a 401: these
// endpoints are public, and the frontend logs the user out on any 401.
func OptionalAuth(cfg *config.Config, rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bearer := r.Header.Get("Authorization")
			if !strings.HasPrefix(bearer, "Bearer ") {
				next.ServeHTTP(w, r)
				return
			}
			claims, err := auth.ParseToken(strings.TrimPrefix(bearer, "Bearer "), cfg.JWTSecret)
			if err != nil || !auth.ValidateSession(r.Context(), claims.JTI, rdb) {
				next.ServeHTTP(w, r)
				return
			}
			ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
			ctx = context.WithValue(ctx, ctxJTI, claims.JTI)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
```

No new imports are needed — the file already imports `context`, `net/http`, `strings`, `auth`, `config`, and `redis`.

- [ ] **Step 2: Set `is_mine` in `GetByID`**

In `be/internal/handlers/reviews.go`, in `GetByID`, after the `FindByID` error handling and before the badge decoration, add:

```go
	// Populated by middleware.OptionalAuth; 0 for a logged-out visitor. This
	// tells a viewer only about themselves, so it leaks nothing about an
	// anonymous author to anyone else.
	if viewerID := middleware.UserIDFromCtx(r.Context()); viewerID != 0 {
		review.IsMine = viewerID == review.AuthorUserID
	}
```

- [ ] **Step 3: Attach the middleware to the route**

In `be/internal/router/router.go`, change:

```go
		r.Get("/reviews/{id}", reviewH.GetByID)
```

to:

```go
		r.With(mw.OptionalAuth(cfg, rdb)).Get("/reviews/{id}", reviewH.GetByID)
```

- [ ] **Step 4: Build and test**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go build ./... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./...
```

Expected: build succeeds, all tests pass.

- [ ] **Step 5: Verify all three viewer cases**

```bash
# logged out — still readable, is_mine false
curl -s "http://localhost:8080/api/v1/reviews/$RID" | grep -o '"is_mine":[a-z]*'
# the author
curl -s "http://localhost:8080/api/v1/reviews/$RID" -H "Authorization: Bearer $TOKEN" | grep -o '"is_mine":[a-z]*'
# someone else
curl -s "http://localhost:8080/api/v1/reviews/$RID" -H "Authorization: Bearer $OTHER_TOKEN" | grep -o '"is_mine":[a-z]*'
# a garbage token must not 401 a public endpoint
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/api/v1/reviews/$RID" -H "Authorization: Bearer nonsense"
```

Expected: `false`, `true`, `false`, `200`.

- [ ] **Step 6: Commit**

```bash
git add be/internal/middleware/auth.go be/internal/handlers/reviews.go be/internal/router/router.go
git commit -m "feat(reviews): optional auth so authors keep ownership of their anonymous reviews"
```

---

### Task 8: Frontend types, avatar support, and translations

**Files:**
- Modify: `fe/src/lib/api.ts:25-80`
- Modify: `fe/src/components/UserAvatar.tsx`
- Modify: `fe/src/locales/en/translation.json`, `fe/src/locales/bn/translation.json`

**Interfaces:**
- Consumes: the API shape from Tasks 3–7.
- Produces: `ApiReviewListItem.author: ApiAuthor | null`, `.is_anonymous: boolean`; `ApiReviewDetail.is_mine: boolean`; `ApiComment.author: ApiAuthor | null`, `.is_anonymous: boolean`; `<UserAvatar anonymous>`; translation keys `review.anonymous`, `reviewForm.anonymousLabel`, `reviewForm.anonymousHint`, `profile.anonymous`, `profile.revealTitle`, `profile.revealBody`, `profile.revealConfirm`, `profile.cancel`, `profile.anonymityUpdated`, `profile.anonymityFailed`.

- [ ] **Step 1: Update the API types**

In `fe/src/lib/api.ts`, change the three interfaces:

```ts
export interface ApiReviewListItem {
  id: number;
  title: string;
  excerpt: string;
  rating: number;
  category: string;
  product: { id: number; name: string };
  /** null when the review is anonymous — the badge still comes through. */
  author: ApiAuthor | null;
  is_anonymous: boolean;
  author_badge?: ApiAuthorBadge | null;
  images: string[];
  likes_count: number;
  comments_count: number;
  is_timeline: boolean;
  timeline_updates_count?: number;
  created_at: string;
}

export interface ApiComment {
  id: number;
  content: string;
  likes_count: number;
  /** null when this is the review author's own comment on their anonymous review. */
  author: ApiAuthor | null;
  is_anonymous: boolean;
  author_badge?: ApiAuthorBadge | null;
  is_owner_reply: boolean;
  company_name?: string;
  created_at: string;
}

export interface ApiReviewDetail extends Omit<ApiReviewListItem, "product"> {
  content: string;
  product: { id: number; name: string; image_url: string };
  views_count: number;
  /** Server-computed: is the viewer the author? Works even when author is masked. */
  is_mine: boolean;
  timeline?: ApiTimelineEntry[];
  comments?: ApiComment[];
}
```

- [ ] **Step 2: Add an anonymous mode to UserAvatar**

The spec calls for a neutral icon, not a letter. In `fe/src/components/UserAvatar.tsx`, change the import line at the top:

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
```

change the props interface:

```tsx
interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Render a neutral icon instead of a letter-avatar, for anonymous authors. */
  anonymous?: boolean;
}
```

and the component:

```tsx
export function UserAvatar({ name, src, size = "sm", className, anonymous }: UserAvatarProps) {
  const { box, text } = SIZES[size];

  // Anonymous authors get one identical neutral avatar. No per-user color and
  // no initial, so two anonymous reviews cannot be linked by their avatar.
  if (anonymous) {
    return (
      <Avatar className={cn(box, className)}>
        <AvatarFallback className="bg-muted text-muted-foreground">
          <UserRound className="h-1/2 w-1/2" />
        </AvatarFallback>
      </Avatar>
    );
  }

  const { bg, fg } = colorFor(name);

  return (
    <Avatar className={cn(box, className)}>
      {src ? <AvatarImage src={src} alt={name} /> : null}
      <AvatarFallback className={cn(bg, fg, text, "font-semibold")}>
        {initialOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
```

- [ ] **Step 3: Add the English strings**

In `fe/src/locales/en/translation.json`, add `"anonymous": "Anonymous"` to the existing `"review"` object, add these to the existing `"reviewForm"` object:

```json
    "anonymousLabel": "Post this review anonymously",
    "anonymousHint": "Your name and photo stay hidden. Your level badge still shows.",
```

and add these to the existing `"profile"` object:

```json
    "anonymous": "Anonymous",
    "revealTitle": "Show your name on this review?",
    "revealBody": "Your name and photo will be visible to everyone. Anyone who sees the review, and any search engine that indexes it, keeps that — turning anonymity back on later will not undo it.",
    "revealConfirm": "Show my name",
    "cancel": "Cancel",
    "anonymityUpdated": "Review visibility updated",
    "anonymityFailed": "Could not update the review",
```

- [ ] **Step 4: Add the Bengali strings**

In `fe/src/locales/bn/translation.json`, add to the matching objects:

`"review"`:

```json
    "anonymous": "বেনামী",
```

`"reviewForm"`:

```json
    "anonymousLabel": "এই রিভিউটি বেনামে প্রকাশ করুন",
    "anonymousHint": "আপনার নাম ও ছবি গোপন থাকবে। আপনার লেভেল ব্যাজ দেখা যাবে।",
```

`"profile"`:

```json
    "anonymous": "বেনামী",
    "revealTitle": "এই রিভিউতে আপনার নাম দেখাবেন?",
    "revealBody": "আপনার নাম ও ছবি সবাই দেখতে পাবে। যারা রিভিউটি দেখে ফেলবে এবং যেসব সার্চ ইঞ্জিন এটি সংরক্ষণ করবে, তাদের কাছে তা থেকে যাবে — পরে আবার বেনামী করলেও তা মুছে যাবে না।",
    "revealConfirm": "আমার নাম দেখান",
    "cancel": "বাতিল",
    "anonymityUpdated": "রিভিউয়ের দৃশ্যমানতা আপডেট হয়েছে",
    "anonymityFailed": "রিভিউ আপডেট করা যায়নি",
```

- [ ] **Step 5: Verify both locale files are valid JSON**

```bash
cd fe && python3 -m json.tool src/locales/en/translation.json > /dev/null && \
python3 -m json.tool src/locales/bn/translation.json > /dev/null && echo "both valid"
```

Expected: `both valid`.

- [ ] **Step 6: Build**

```bash
cd fe && npm run build
```

Expected: build fails with TypeScript errors at the call sites that read `author.username` on a now-nullable author (`Categories.tsx`, `BrowseReviews.tsx`, `Index.tsx`, `ReviewDetails.tsx`, `ProductReviews.tsx`). **This is expected** — Tasks 9 and 10 fix them. Record the list of failing files.

- [ ] **Step 7: Commit**

```bash
git add fe/src/lib/api.ts fe/src/components/UserAvatar.tsx fe/src/locales/en/translation.json fe/src/locales/bn/translation.json
git commit -m "feat(fe): nullable review author types, anonymous avatar, translations"
```

---

### Task 9: Anonymous rendering in review cards

**Files:**
- Modify: `fe/src/components/ReviewCard.tsx`
- Modify: `fe/src/pages/Categories.tsx:16-22`, `fe/src/pages/BrowseReviews.tsx:19-25`, `fe/src/pages/Index.tsx:22-28` and `:79`
- Modify: `fe/src/pages/ProductReviews.tsx:205-225`

**Interfaces:**
- Consumes: `ApiReviewListItem.author | null`, `.is_anonymous`, `<UserAvatar anonymous>` from Task 8.
- Produces: `ReviewCardProps.isAnonymous?: boolean`.

- [ ] **Step 1: Accept and render anonymity in ReviewCard**

In `fe/src/components/ReviewCard.tsx`, add to `ReviewCardProps` after `authorBadge`:

```tsx
  isAnonymous?: boolean;
```

add `isAnonymous,` to the destructured parameter list after `authorBadge,`, and change the author block:

```tsx
            <div className="flex items-center gap-2">
              <UserAvatar name={author} src={authorAvatar} size="xs" />
              <div>
                <p className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                  {author}
```

to:

```tsx
            <div className="flex items-center gap-2">
              <UserAvatar
                name={isAnonymous ? "" : author}
                src={isAnonymous ? undefined : authorAvatar}
                size="xs"
                anonymous={isAnonymous}
              />
              <div>
                <p className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                  {isAnonymous ? t("review.anonymous") : author}
```

The badge line directly below is unchanged — an anonymous author keeps their badge.

- [ ] **Step 2: Fix the three list-page mappers**

In `fe/src/pages/Categories.tsx`, `fe/src/pages/BrowseReviews.tsx`, and `fe/src/pages/Index.tsx`, each has an identical three-line block. Change:

```tsx
    author: r.author.username,
    authorAvatar: r.author.avatar_url,
    authorBadge: r.author_badge,
```

to:

```tsx
    author: r.author?.username ?? "",
    authorAvatar: r.author?.avatar_url ?? "",
    authorBadge: r.author_badge,
    isAnonymous: r.is_anonymous,
```

- [ ] **Step 3: Fix the featured review on Index**

In `fe/src/pages/Index.tsx:79`, change:

```tsx
        author: featured.author.username,
```

to:

```tsx
        author: featured.is_anonymous ? t("review.anonymous") : featured.author?.username ?? "",
```

If `t` is not already in scope in that function, take it from the existing `useTranslation()` call in the component.

- [ ] **Step 4: Fix the ProductReviews author block**

This page hand-rolls its own avatar instead of using the shared component. Replace lines 212-224 — the whole `review.author.avatar_url ? <img> : <div>` conditional plus the name below it:

```tsx
                      {review.author.avatar_url ? (
                        <img
                          src={review.author.avatar_url}
                          alt={`${review.author.username}'s profile photo`}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                          {review.author.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-card-foreground">{review.author.username}</p>
```

with the shared component, which already covers both the image and fallback cases:

```tsx
                      <UserAvatar
                        name={review.is_anonymous ? "" : review.author?.username ?? ""}
                        src={review.is_anonymous ? undefined : review.author?.avatar_url}
                        size="sm"
                        anonymous={review.is_anonymous}
                      />
                      <div>
                        <p className="font-medium text-card-foreground">
                          {review.is_anonymous ? t("review.anonymous") : review.author?.username ?? ""}
                        </p>
```

Leave the `formatDate` line that follows untouched. Add the import at the top of the file:

```tsx
import { UserAvatar } from "@/components/UserAvatar";
```

`t` is already in scope from the `useTranslation()` call at line 25. After this edit, `grep -n "review.author\." fe/src/pages/ProductReviews.tsx` must return nothing.

- [ ] **Step 5: Build and lint**

```bash
cd fe && npm run build && npm run lint
```

Expected: build succeeds. The only remaining TypeScript errors, if any, are in `ReviewDetails.tsx`, which Task 10 handles — if the build still fails there, that is expected; confirm no other file is failing.

- [ ] **Step 6: Verify in the browser**

Run `cd fe && npm run dev`, open `/browse`, and find the review you flagged anonymous in Task 3.

Expected: it shows a neutral grey person icon and "Anonymous", with the level badge still beside the name. Other cards are unchanged.

- [ ] **Step 7: Commit**

```bash
git add fe/src/components/ReviewCard.tsx fe/src/pages/Categories.tsx fe/src/pages/BrowseReviews.tsx fe/src/pages/Index.tsx fe/src/pages/ProductReviews.tsx
git commit -m "feat(fe): render anonymous authors in review cards and product pages"
```

---

### Task 10: Anonymous rendering on the review detail page

**Files:**
- Modify: `fe/src/pages/ReviewDetails.tsx` — ownership check (`:157`), JSON-LD (`:171`), meta description (`:191`), header (`:223-227`), owner-reply comment card (`:414-418`), regular comment card (`:442-446`)

**Interfaces:**
- Consumes: `ApiReviewDetail.is_mine`, `.is_anonymous`, `ApiComment.is_anonymous` from Task 8; `<UserAvatar anonymous>`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Derive the display name once**

In `fe/src/pages/ReviewDetails.tsx`, replace line 157:

```tsx
  const isAuthor = user && user.id === review.author.id;
```

with:

```tsx
  // is_mine comes from the server, so this still works when the author is
  // masked — review.author is null on an anonymous review.
  const isAuthor = review.is_mine;
  const authorName = review.is_anonymous
    ? t("review.anonymous")
    : review.author?.username ?? "";
```

- [ ] **Step 2: Keep the real name out of the page metadata**

Search engines index JSON-LD and meta descriptions, so these must use the masked name too. Change line 171:

```tsx
      author: { "@type": "Person", name: review.author.username },
```

to:

```tsx
      author: { "@type": "Person", name: authorName },
```

and line 191:

```tsx
        description={review.excerpt ?? `${review.author.username} reviewed ${review.product.name} — rated ${review.rating}/5.`}
```

to:

```tsx
        description={review.excerpt ?? `${authorName} reviewed ${review.product.name} — rated ${review.rating}/5.`}
```

- [ ] **Step 3: Update the review header**

Change lines 223-226:

```tsx
                  <UserAvatar name={review.author.username} src={review.author.avatar_url} size="md" />
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      {review.author.username}
```

to:

```tsx
                  <UserAvatar
                    name={review.is_anonymous ? "" : authorName}
                    src={review.is_anonymous ? undefined : review.author?.avatar_url}
                    size="md"
                    anonymous={review.is_anonymous}
                  />
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      {authorName}
```

- [ ] **Step 4: Update both comment cards**

The owner-reply card (lines 414-417) and the regular comment card (lines 442-445) share the same two-line shape. In **both**, change:

```tsx
                          <UserAvatar name={comment.author.username} src={comment.author.avatar_url} size="sm" className="ring-2 ring-primary/30" />
```

to:

```tsx
                          <UserAvatar
                            name={comment.is_anonymous ? "" : comment.author?.username ?? ""}
                            src={comment.is_anonymous ? undefined : comment.author?.avatar_url}
                            size="sm"
                            anonymous={comment.is_anonymous}
                            className="ring-2 ring-primary/30"
                          />
```

(the regular card has no `className` prop — drop that line there), and change:

```tsx
                              <span className="font-semibold text-foreground">{comment.author.username}</span>
```

to:

```tsx
                              <span className="font-semibold text-foreground">
                                {comment.is_anonymous ? t("review.anonymous") : comment.author?.username ?? ""}
                              </span>
```

- [ ] **Step 5: Build and lint**

```bash
cd fe && npm run build && npm run lint
```

Expected: build succeeds with no TypeScript errors anywhere. Lint reports no new warnings.

- [ ] **Step 6: Verify the whole thread in the browser**

Open the anonymous review's detail page as the author.

Expected: the header shows the neutral icon plus "Anonymous" with the badge; the "Add Timeline" button is still there (proving `is_mine` works); the author's own comment shows as "Anonymous" with their badge; another user's comment shows their real name. View the page source and confirm the real username appears nowhere in the JSON-LD or the meta description.

- [ ] **Step 7: Commit**

```bash
git add fe/src/pages/ReviewDetails.tsx
git commit -m "feat(fe): anonymous author and comment rendering on review detail"
```

---

### Task 11: The "post anonymously" checkbox

**Files:**
- Modify: `fe/src/components/ReviewForm.tsx`

**Interfaces:**
- Consumes: `POST /reviews` accepting `is_anonymous` from Task 5; translation keys from Task 8.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the state**

In `fe/src/components/ReviewForm.tsx`, after the `const [images, setImages] = useState<File[]>([]);` line, add:

```tsx
  const [isAnonymous, setIsAnonymous] = useState(false);
```

and add the import at the top:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 2: Send the field**

The submit handler builds a `FormData` named `fd` at line 180. Add one line directly after `fd.append("rating", String(formData.rating));` (line 191):

```tsx
      fd.append("is_anonymous", isAnonymous ? "true" : "false");
```

- [ ] **Step 3: Render the checkbox**

Immediately above the submit button in the JSX, add:

```tsx
        <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
          <Checkbox
            id="is-anonymous"
            checked={isAnonymous}
            onCheckedChange={(v) => setIsAnonymous(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="is-anonymous" className="cursor-pointer font-medium">
              {t("reviewForm.anonymousLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("reviewForm.anonymousHint")}
            </p>
          </div>
        </div>
```

- [ ] **Step 4: Build and lint**

```bash
cd fe && npm run build && npm run lint
```

Expected: both succeed.

- [ ] **Step 5: Verify end to end**

Run the app, log in, and submit a review with the box ticked. Then check the database and the public listing:

```bash
mysql -u root -p "$DB_NAME" -e "SELECT id, title, is_anonymous FROM reviews ORDER BY id DESC LIMIT 1"
```

Expected: `is_anonymous = 1`. Approve the review in the CMS, then confirm it renders as "Anonymous" on `/browse`. Submit a second review with the box unticked and confirm it renders with the real name.

- [ ] **Step 6: Commit**

```bash
git add fe/src/components/ReviewForm.tsx
git commit -m "feat(fe): post-anonymously checkbox on the review form"
```

---

### Task 12: The profile anonymity toggle

**Files:**
- Modify: `fe/src/pages/Profile.tsx:24-31` (`MyReview` type), `:307-323` (the review row)

**Interfaces:**
- Consumes: `PATCH /reviews/{id}/anonymity` from Task 6; `is_anonymous` on `/profile/reviews` from Task 6; translation keys from Task 8.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the field to the local type**

In `fe/src/pages/Profile.tsx`, change:

```tsx
interface MyReview {
  id: number;
  title: string;
  rating: number;
  is_approved: boolean;
  product: string;
  created_at: string;
}
```

to:

```tsx
interface MyReview {
  id: number;
  title: string;
  rating: number;
  is_approved: boolean;
  is_anonymous: boolean;
  product: string;
  created_at: string;
}
```

- [ ] **Step 2: Add the mutation and confirm-dialog state**

Add the imports at the top:

```tsx
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
```

(merge `useMutation` / `useQueryClient` into the existing `@tanstack/react-query` import if one is already there).

Then, next to the other hooks in the component, add:

```tsx
  const queryClient = useQueryClient();
  // Holds the review awaiting confirmation before its name is revealed.
  const [revealing, setRevealing] = useState<MyReview | null>(null);

  const anonymityMutation = useMutation({
    mutationFn: ({ id, isAnonymous }: { id: number; isAnonymous: boolean }) =>
      apiFetch(`/reviews/${id}/anonymity`, {
        method: "PATCH",
        body: JSON.stringify({ is_anonymous: isAnonymous }),
      }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-reviews"] });
      toast({ title: t("profile.anonymityUpdated") });
    },
    onError: () => {
      toast({ title: t("profile.anonymityFailed"), variant: "destructive" });
    },
  });

  // Turning anonymity ON is immediate. Turning it OFF asks first, because
  // revealing a name cannot be undone for anyone who has already seen it.
  const handleAnonymityChange = (rv: MyReview, next: boolean) => {
    if (next) {
      anonymityMutation.mutate({ id: rv.id, isAnonymous: true });
    } else {
      setRevealing(rv);
    }
  };
```

`toast` is already in scope (`const { toast } = useToast();` at line 47) and `useState` is already imported — do not re-add either.

- [ ] **Step 3: Restructure the review row**

The whole row is currently a `<Link>`, so a switch inside it would navigate on click. Move the link to the text half only. Replace the `myReviews.map` block:

```tsx
              {myReviews.map(rv => (
                <li key={rv.id}>
                  <div className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors group">
                    <Link to={`/review/${rv.id}`} className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{rv.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rv.product} · {new Date(rv.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US")}</p>
                    </Link>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StarRow rating={rv.rating} />
                      {!rv.is_approved && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">{t("profile.pending")}</Badge>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-muted-foreground">{t("profile.anonymous")}</span>
                        <Switch
                          checked={rv.is_anonymous}
                          onCheckedChange={(next) => handleAnonymityChange(rv, next)}
                          disabled={anonymityMutation.isPending}
                        />
                      </label>
                      <Link to={`/review/${rv.id}`}>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
```

- [ ] **Step 4: Add the confirmation dialog**

At the end of the component's JSX, just before the closing wrapper element, add:

```tsx
      <AlertDialog open={revealing !== null} onOpenChange={(open) => !open && setRevealing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.revealTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("profile.revealBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("profile.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revealing) {
                  anonymityMutation.mutate({ id: revealing.id, isAnonymous: false });
                }
                setRevealing(null);
              }}
            >
              {t("profile.revealConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 5: Build and lint**

```bash
cd fe && npm run build && npm run lint
```

Expected: both succeed.

- [ ] **Step 6: Verify both directions in the browser**

On `/profile`, with at least one anonymous and one public review:

1. Toggle a public review to anonymous — applies immediately, toast appears, switch stays on. Open the review in a logged-out window: it shows "Anonymous".
2. Toggle an anonymous review off — the confirmation dialog appears. Cancel: the switch snaps back to on and nothing changes server-side (reload to confirm). Confirm: the name returns on the public page.
3. Clicking the row title still navigates to the review; clicking the switch does not.

- [ ] **Step 7: Run the whole suite one last time**

```bash
cd be && docker run --rm -v "$PWD":/app -w /app golang:1.22-alpine go test ./... && \
cd ../fe && npm run build && npm run lint
```

Expected: Go tests pass, frontend build and lint clean.

- [ ] **Step 8: Commit**

```bash
git add fe/src/pages/Profile.tsx
git commit -m "feat(fe): anonymity toggle with reveal confirmation on the profile page"
```

---

## Done criteria

- A user can tick "Post this review anonymously" and the published review shows a neutral icon, "Anonymous", and their level badge — no name, no avatar, on cards, the detail page, product pages, and the owner dashboard.
- The same user's next review, submitted without the box ticked, shows their real name.
- The author's own comments on their anonymous review render as "Anonymous"; other users' comments in the same thread are unaffected.
- Searching the author's username does not surface their anonymous reviews.
- The author can toggle anonymity from their profile in both directions, with a warning before revealing.
- The author still sees the "Add Timeline" button on their own anonymous review.
- Admins still see the real author everywhere in the CMS.
- The real username appears nowhere in the anonymous review's HTML, JSON-LD, or meta description.
