# Home Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the BdRanks home page with a six-section, shopper-first layout, keeping the old page reachable at `/home-old`.

**Architecture:** The new `Index.tsx` is a thin composition of five self-contained section components plus a rewritten `HeroSection`. Each section owns its own React Query call, skeleton, and empty state, and takes no props. Two small backend changes feed the new sections: the review list gains a `timeline_ratings` array when the timeline filter is on, and the rewards leaderboard becomes callable without a token.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack React Query, Tailwind + shadcn/ui, react-i18next, lucide-react icons; Go 1.22 + chi + MySQL on the backend.

**Spec:** `docs/superpowers/specs/2026-09-08-home-page-redesign-design.md`

**Mockup:** https://claude.ai/code/artifact/a0a15fd3-8963-4cac-9439-014a69aaea14

## Global Constraints

- **Nothing is deleted.** `FeaturesSection`, `TimelinePreview`, `ReviewedProducts`, `ReviewedProductsGrid` and every existing locale key stay, because the legacy page still renders them.
- **Both languages, same task.** Every new locale key is written into `fe/src/locales/en/translation.json` AND `fe/src/locales/bn/translation.json` in the task that introduces it. Never leave Bangla for later.
- **Type-check is `npx tsc --noEmit -p tsconfig.app.json` run from `fe/`.** `npm run build` uses esbuild and does NOT type-check, so a green build proves nothing. `npm run lint` has a pre-existing baseline of 36 problems (27 errors, 9 warnings) — do not treat those as regressions, but do not add new ones.
- **Go runs through Docker.** Go is not installed on this machine. Every Go command is `docker run --rm -v "$PWD":/app -w /app golang:1.22 <cmd>` from the repo root.
- **Never `git push`.** Pushing to `main` triggers a production deploy. Commit locally only. All work happens on the existing `feat/home-redesign` branch.
- **Section failure is silent.** Every new section renders nothing when its query fails or returns empty. No section shows an error state, and one failing section never breaks the page.
- **Icons come from `lucide-react`.** No inline SVG, no emoji.
- **Styling follows existing tokens.** Use the Tailwind classes already used by `ReviewCard` and `ReviewedProducts`: `bg-card`, `border-border/60`, `rounded-2xl`, `shadow-soft`, `hover:shadow-elevated`, `font-serif` for headings, `text-muted-foreground` for secondary text.

---

### Task 1: Backend — `timeline_ratings` on the review list

**Files:**
- Modify: `be/internal/models/review.go` (add field near `TimelineUpdatesCount`, around line 57)
- Modify: `be/internal/repository/review.go:83-140` (the `List` data query and scan loop)
- Test: `be/internal/repository/timeline_ratings_test.go` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `models.Review.TimelineRatings []int` with JSON tag `timeline_ratings,omitempty`; helper `parseTimelineRatings(s sql.NullString) []int` in package `repository`.

- [ ] **Step 1: Write the failing test**

Create `be/internal/repository/timeline_ratings_test.go`:

```go
package repository

import (
	"database/sql"
	"testing"
)

func TestParseTimelineRatingsOrder(t *testing.T) {
	got := parseTimelineRatings(sql.NullString{String: "5,4,3", Valid: true})
	want := []int{5, 4, 3}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestParseTimelineRatingsEmptyIsNil(t *testing.T) {
	// A review with no timeline entries must omit the field entirely rather
	// than serialising an empty array, so the frontend can tell them apart.
	if got := parseTimelineRatings(sql.NullString{}); got != nil {
		t.Fatalf("invalid NullString -> %v, want nil", got)
	}
	if got := parseTimelineRatings(sql.NullString{String: "", Valid: true}); got != nil {
		t.Fatalf("empty string -> %v, want nil", got)
	}
}

func TestParseTimelineRatingsSkipsGarbage(t *testing.T) {
	got := parseTimelineRatings(sql.NullString{String: "5,,x,2", Valid: true})
	want := []int{5, 2}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %v, want %v", got, want)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run from the repo root:

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/internal/repository/ -run TestParseTimelineRatings -v
```

Expected: FAIL — `undefined: parseTimelineRatings`.

- [ ] **Step 3: Add the model field**

In `be/internal/models/review.go`, directly after the `TimelineUpdatesCount` field:

```go
	TimelineUpdatesCount int             `json:"timeline_updates_count,omitempty"`
	// TimelineRatings carries each timeline entry's rating in chronological
	// order. Populated only when the caller asked for timeline reviews, so a
	// plain list query pays nothing for it.
	TimelineRatings      []int           `json:"timeline_ratings,omitempty"`
```

- [ ] **Step 4: Write the parse helper**

Add to the bottom of `be/internal/repository/review.go`:

```go
// parseTimelineRatings splits the GROUP_CONCAT of timeline entry ratings into
// a slice. Returns nil (not an empty slice) when there are none, so the JSON
// field is omitted rather than rendered as [].
func parseTimelineRatings(s sql.NullString) []int {
	if !s.Valid || s.String == "" {
		return nil
	}
	parts := strings.Split(s.String, ",")
	out := make([]int, 0, len(parts))
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			continue
		}
		out = append(out, n)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
```

Confirm `strconv` is in the file's import block; add it if missing (`strings` and `database/sql` are already imported).

- [ ] **Step 5: Run test to verify it passes**

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/internal/repository/ -run TestParseTimelineRatings -v
```

Expected: PASS, all three tests.

- [ ] **Step 6: Select the ratings in the list query**

In `be/internal/repository/review.go`, inside `List`, the data query is built with `fmt.Sprintf` around line 83. Add a conditional select expression above it, next to the existing `having` block:

```go
	having := ""
	timelineRatingsExpr := "NULL"
	if f.TimelineOnly {
		having = "HAVING COUNT(DISTINCT te.id) > 0"
		timelineRatingsExpr = "GROUP_CONCAT(te.rating ORDER BY te.created_at, te.id)"
	}
```

Then in the `dataQuery` string, change the images line so the new column is selected immediately after it:

```go
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			%s AS timeline_ratings,
```

and add `timelineRatingsExpr` to the `fmt.Sprintf` argument list **before** `whereClause`, so the argument order matches the verb order in the format string. The `fmt.Sprintf` call becomes:

```go
	dataQuery := fmt.Sprintf(`... `, timelineRatingsExpr, whereClause, having, orderBy)
```

Read the format string top to bottom and confirm the four `%s` verbs are, in order: the ratings expression, the where clause, the having clause, the order-by clause.

- [ ] **Step 7: Scan the new column**

In the same `List` scan loop, add a variable beside `imagesStr`:

```go
		var imagesStr sql.NullString
		var timelineRatingsStr sql.NullString
```

Add `&timelineRatingsStr` to the `rows.Scan(...)` argument list immediately after `&imagesStr`, matching the select order. Then after the existing images assignment, add:

```go
		rv.TimelineRatings = parseTimelineRatings(timelineRatingsStr)
```

- [ ] **Step 8: Verify the package builds and all its tests pass**

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./be/... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/... 2>&1 | tail -25
```

Expected: build succeeds; every package reports `ok` or `no test files`. If a package fails for a reason unrelated to this change, note it and stop rather than editing around it.

- [ ] **Step 9: Commit**

```bash
git add be/internal/models/review.go be/internal/repository/review.go be/internal/repository/timeline_ratings_test.go
git commit -m "feat(api): expose timeline entry ratings on the review list"
```

---

### Task 2: Backend — anonymous access to the leaderboard

**Files:**
- Modify: `be/internal/rewards/routes.go:11-30`
- Modify: `be/internal/router/router.go:234-237` (the `rewards.RegisterRoutes` call)
- Test: `be/internal/rewards/routes_test.go` (create)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `rewards.RegisterRoutes(r chi.Router, svc *Service, auth, optionalAuth, admin func(http.Handler) http.Handler)` — note the new third parameter. `GET /rewards/leaderboard` answers 200 with no `Authorization` header.

- [ ] **Step 1: Write the failing test**

Create `be/internal/rewards/routes_test.go`:

```go
package rewards

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// passthrough stands in for OptionalAuth: it sets no user and always continues.
func passthrough(next http.Handler) http.Handler { return next }

// blocking stands in for Auth: it rejects every request, so a route mounted
// under it can be told apart from one mounted under optional auth.
func blocking(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
}

func TestLeaderboardIsReachableWithoutAuth(t *testing.T) {
	r := chi.NewRouter()
	RegisterRoutes(r, nil, blocking, passthrough, blocking)

	req := httptest.NewRequest(http.MethodGet, "/rewards/leaderboard?timeframe=week&limit=5&offset=0", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	// The handler itself will panic or error on a nil service; all this test
	// asserts is that the request was not turned away by the auth middleware.
	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("anonymous leaderboard request got 401; it must be mounted under optional auth")
	}
}

func TestRewardsMeStillRequiresAuth(t *testing.T) {
	r := chi.NewRouter()
	RegisterRoutes(r, nil, blocking, passthrough, blocking)

	req := httptest.NewRequest(http.MethodGet, "/rewards/me", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("/rewards/me code = %d, want 401 — it must stay behind auth", rec.Code)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/internal/rewards/ -run 'TestLeaderboardIsReachable|TestRewardsMeStill' -v
```

Expected: FAIL — `too many arguments in call to RegisterRoutes` (the function takes four parameters today, the test passes five).

- [ ] **Step 3: Add the parameter and move the route**

In `be/internal/rewards/routes.go`, change the signature and move the leaderboard line out of the JWT group into its own optional-auth group:

```go
func RegisterRoutes(r chi.Router, svc *Service, auth, optionalAuth, admin func(http.Handler) http.Handler) {
	a := &api{svc: svc}

	// public
	r.Get("/rewards/levels", a.levels)

	// public, but a signed-in caller gets their own row flagged
	r.Group(func(r chi.Router) {
		r.Use(optionalAuth)
		r.Get("/rewards/leaderboard", a.leaderboard)
	})

	// user (JWT)
	r.Group(func(r chi.Router) {
		r.Use(auth)
		r.Get("/rewards/me", a.me)
		r.Get("/rewards/me/transactions", a.history)
		r.Get("/rewards/items", a.items)
		r.Post("/rewards/redeem", a.redeem)
		r.Get("/rewards/me/redemptions", a.myRedemptions)
		r.Get("/rewards/campaigns", a.campaigns)
		r.Post("/rewards/campaigns/{id}/redeem", a.redeemCampaign)
	})
```

Leave the admin group untouched. No handler change is needed: `a.leaderboard` reads the user id with `middleware.UserIDFromCtx`, which returns 0 when absent, and `Service.Leaderboard` already treats 0 as "no me row" (`UserRank` returns zero points, so `Me.Unranked` is true).

- [ ] **Step 4: Update the call site**

In `be/internal/router/router.go`, the call near line 234 becomes:

```go
		rewards.RegisterRoutes(r, rewardsSvc,
			mw.Auth(cfg, rdb),
			mw.OptionalAuth(cfg, rdb),
			mw.Admin(cfg, rdb, userRepo),
		)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./be/... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/internal/rewards/ -v 2>&1 | tail -25
```

Expected: build succeeds; both new tests PASS and the existing rewards tests still pass.

- [ ] **Step 6: Commit**

```bash
git add be/internal/rewards/routes.go be/internal/rewards/routes_test.go be/internal/router/router.go
git commit -m "feat(api): let anonymous visitors read the rewards leaderboard"
```

---

### Task 3: Backend — category stats count only approved reviews

**Files:**
- Modify: `be/internal/repository/product.go:165-188`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /categories/stats` returns counts that match what `/browse?category=<slug>` shows.

- [ ] **Step 1: Read the current query**

```bash
sed -n '160,190p' be/internal/repository/product.go
```

Confirm the join is `LEFT JOIN reviews r ON p.id = r.product_id` with no approval filter.

- [ ] **Step 2: Add the approval filter**

In `CategoryStats`, change the join line so unapproved reviews are excluded. The filter belongs in the `ON` clause, not a `WHERE` clause — a `WHERE` would drop categories whose products have no approved reviews instead of reporting them as zero:

```go
	rows, err := r.db.QueryContext(ctx, `
		SELECT p.category, COUNT(r.id) as review_count
		FROM products p
		LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
		GROUP BY p.category`)
```

- [ ] **Step 3: Verify the package builds and tests pass**

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./be/... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/... 2>&1 | tail -20
```

Expected: build succeeds, all packages `ok` or `no test files`.

- [ ] **Step 4: Commit**

```bash
git add be/internal/repository/product.go
git commit -m "fix(api): category stats counted unapproved reviews"
```

---

### Task 4: Frontend — API types and the legacy page

**Files:**
- Modify: `fe/src/lib/api.ts:46-74` (add `timeline_ratings` to `ApiReviewListItem`)
- Create: `fe/src/pages/IndexLegacy.tsx` (a copy of today's `Index.tsx`)
- Modify: `fe/src/App.tsx` (import and route the legacy page)
- Modify: `fe/public/robots.txt` (disallow the legacy route)

**Interfaces:**
- Consumes: `timeline_ratings` from Task 1.
- Produces: `ApiReviewListItem.timeline_ratings?: number[]`; the route `/home-old`. Later tasks overwrite `fe/src/pages/Index.tsx` freely, because the old markup now lives in `IndexLegacy.tsx`.

- [ ] **Step 1: Add the API type**

In `fe/src/lib/api.ts`, inside `ApiReviewListItem`, directly after `timeline_updates_count`:

```ts
  is_timeline: boolean;
  timeline_updates_count?: number;
  /**
   * Each timeline entry's rating, oldest first. Sent only when the request
   * asked for timeline reviews (`timeline_only=true`); absent otherwise.
   */
  timeline_ratings?: number[];
  created_at: string;
```

- [ ] **Step 2: Copy the current home page to the legacy file**

```bash
cp fe/src/pages/Index.tsx fe/src/pages/IndexLegacy.tsx
```

- [ ] **Step 3: Rename the legacy component and mark it noindex**

In `fe/src/pages/IndexLegacy.tsx` make exactly three edits and change nothing else:

1. `const Index = () => {` becomes `const IndexLegacy = () => {`
2. `export default Index;` becomes `export default IndexLegacy;`
3. The `PageHead` call becomes:

```tsx
      <PageHead
        title="BdRanks - Home (previous design)"
        description="The previous BdRanks home page layout, kept for reference."
        noindex
      />
```

Note that dropping `jsonLd={orgSchema}` from the legacy page leaves `orgSchema` unused. Delete the `orgSchema` constant from `IndexLegacy.tsx` only — the new `Index.tsx` keeps it.

- [ ] **Step 4: Route the legacy page**

In `fe/src/App.tsx`, add the import beside the existing `Index` import:

```tsx
import Index from "./pages/Index";
import IndexLegacy from "./pages/IndexLegacy";
```

and the route directly under the `/` route:

```tsx
            <Route path="/" element={<Index />} />
            <Route path="/home-old" element={<IndexLegacy />} />
```

- [ ] **Step 5: Keep the legacy route out of search results**

In `fe/public/robots.txt`, add one line to the existing `Disallow` block, above the `Sitemap:` line:

```
Disallow: /home-old
```

- [ ] **Step 6: Type-check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json
```

Expected: no output (clean). If `orgSchema` is reported as unused in the legacy file, delete that constant as described in Step 3.

- [ ] **Step 7: Commit**

```bash
git add fe/src/lib/api.ts fe/src/pages/IndexLegacy.tsx fe/src/App.tsx fe/public/robots.txt
git commit -m "chore(fe): keep the previous home page at /home-old"
```

---

### Task 5: Frontend — locale keys for every new section

**Files:**
- Modify: `fe/src/locales/en/translation.json`
- Modify: `fe/src/locales/bn/translation.json`

**Interfaces:**
- Consumes: nothing.
- Produces: every `home.*` key used by Tasks 6 through 10, plus the shortened `hero.subtitle`. Doing all copy in one task means no later task has to touch two JSON files.

- [ ] **Step 1: Add the English keys**

In `fe/src/locales/en/translation.json`, add these keys inside the existing `"home"` object, keeping the keys already there:

```json
    "timelineHeading": "How it holds up",
    "timelineSubtitle": "Reviewers come back months later and update their rating.",
    "timelineUpdated_one": "Updated {{count}} time",
    "timelineUpdated_other": "Updated {{count}} times",
    "categoriesHeading": "Browse by category",
    "categoriesSubtitle": "Every review sorted into four kinds of things you buy.",
    "categoryReviews_one": "{{count}} review",
    "categoryReviews_other": "{{count}} reviews",
    "seeAllReviews": "See all reviews",
    "latestSubtitle": "Fresh from the community this week.",
    "trustModeratedTitle": "Checked by a human",
    "trustModeratedBody": "Every review and comment is moderated before it counts.",
    "trustVerifiedTitle": "Verified owners",
    "trustVerifiedBody": "Businesses are vetted before they get a badge or reply.",
    "trustTimelineTitle": "Timelines can't be faked",
    "trustTimelineBody": "Updates come from real buyers months after purchase.",
    "topReviewersEyebrow": "This week's top reviewers",
    "rewardsHeading": "Earn rewards for honest reviews",
    "rewardsBody": "Every review, photo and comment earns points. Climb levels, show your badge, and spend points in the rewards store.",
    "rewardsLink": "See rewards",
    "ownerHeading": "Own a business?",
    "ownerBody": "Print a QR poster for your counter and put a live rating widget on your own website. Reviews you collect show up on your BdRanks page.",
    "ownerLink": "Register your business"
```

In the same file, replace the value of the existing `hero.subtitle` key with the shorter mockup copy:

```json
    "subtitle": "Honest reviews from people in Bangladesh who come back months later and tell you how it held up."
```

- [ ] **Step 2: Add the Bangla keys**

In `fe/src/locales/bn/translation.json`, add the matching keys inside `"home"`:

```json
    "timelineHeading": "সময়ের সাথে কেমন টিকল",
    "timelineSubtitle": "রিভিউয়াররা কয়েক মাস পর ফিরে এসে রেটিং আপডেট করেন।",
    "timelineUpdated_one": "{{count}} বার আপডেট",
    "timelineUpdated_other": "{{count}} বার আপডেট",
    "categoriesHeading": "ক্যাটাগরি অনুযায়ী ব্রাউজ করুন",
    "categoriesSubtitle": "সব রিভিউ সাজানো আছে চার ধরনের কেনাকাটায়।",
    "categoryReviews_one": "{{count}}টি রিভিউ",
    "categoryReviews_other": "{{count}}টি রিভিউ",
    "seeAllReviews": "সব রিভিউ দেখুন",
    "latestSubtitle": "এই সপ্তাহে কমিউনিটি থেকে আসা নতুন রিভিউ।",
    "trustModeratedTitle": "মানুষ যাচাই করে",
    "trustModeratedBody": "প্রতিটি রিভিউ ও মন্তব্য গণনার আগে মডারেশনে যায়।",
    "trustVerifiedTitle": "ভেরিফায়েড ব্যবসা",
    "trustVerifiedBody": "ব্যাজ বা রিপ্লাই পাওয়ার আগে ব্যবসা যাচাই করা হয়।",
    "trustTimelineTitle": "টাইমলাইন নকল করা যায় না",
    "trustTimelineBody": "আপডেট আসে প্রকৃত ক্রেতাদের কাছ থেকে, কেনার কয়েক মাস পর।",
    "topReviewersEyebrow": "এই সপ্তাহের সেরা রিভিউয়ার",
    "rewardsHeading": "সৎ রিভিউ দিয়ে পুরস্কার জিতুন",
    "rewardsBody": "প্রতিটি রিভিউ, ছবি ও মন্তব্যে পয়েন্ট জমে। লেভেল বাড়ান, ব্যাজ দেখান, আর রিওয়ার্ড স্টোরে পয়েন্ট খরচ করুন।",
    "rewardsLink": "রিওয়ার্ড দেখুন",
    "ownerHeading": "ব্যবসার মালিক?",
    "ownerBody": "কাউন্টারের জন্য QR পোস্টার প্রিন্ট করুন আর নিজের ওয়েবসাইটে লাইভ রেটিং উইজেট বসান। সংগ্রহ করা রিভিউ আপনার BdRanks পেজে দেখা যাবে।",
    "ownerLink": "আপনার ব্যবসা নিবন্ধন করুন"
```

Replace the existing Bangla `hero.subtitle` value with:

```json
    "subtitle": "বাংলাদেশের মানুষের সৎ রিভিউ — যারা কয়েক মাস পরে ফিরে এসে বলেন জিনিসটা কেমন টিকল।"
```

- [ ] **Step 3: Verify both files are valid JSON with matching key sets**

```bash
cd fe && python3 -c "
import json
en = json.load(open('src/locales/en/translation.json'))
bn = json.load(open('src/locales/bn/translation.json'))
for section in ('home', 'hero'):
    missing = set(en[section]) - set(bn[section])
    extra = set(bn[section]) - set(en[section])
    print(section, 'missing in bn:', sorted(missing), '| only in bn:', sorted(extra))
"
```

Expected: both lists empty for both sections. Fix any mismatch before committing.

- [ ] **Step 4: Commit**

```bash
git add fe/src/locales/en/translation.json fe/src/locales/bn/translation.json
git commit -m "feat(fe): copy for the redesigned home page, English and Bangla"
```

---

### Task 6: Frontend — rewrite the hero

**Files:**
- Modify: `fe/src/components/HeroSection.tsx`

**Interfaces:**
- Consumes: the shortened `hero.subtitle` from Task 5; the existing `hero.stats*` labels.
- Produces: a shorter `HeroSection` with the same export name and no props. Later tasks compose it unchanged.

- [ ] **Step 1: Remove the decorative layers**

In `fe/src/components/HeroSection.tsx`, delete three sibling `<div>` blocks inside the `<section>`, identifiable by their comments:

- `{/* Decorative blobs */}`
- `{/* Twinkling sparkles */}`
- `{/* Informative floating cards (left / right) */}`

Delete all three in full, including their children.

- [ ] **Step 2: Remove the two hero buttons**

Delete the block introduced by this line and its two `<Link>` children:

```tsx
          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-up animation-delay-300">
```

The header already carries "Write a Review", and the search box submits to browse.

- [ ] **Step 3: Replace the three-column stats grid with an inline strip**

Replace the whole `{stats && ( ... )}` block with:

```tsx
          {stats && (
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground animate-fade-in animation-delay-300">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span>
                <strong className="font-serif text-base font-bold text-foreground">
                  {fmt(stats.reviews)}
                </strong>{" "}
                {t("hero.statsReviews")}
              </span>
              <span className="text-border">·</span>
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>
                <strong className="font-serif text-base font-bold text-foreground">
                  {fmt(stats.timelines)}
                </strong>{" "}
                {t("hero.statsTimelines")}
              </span>
              <span className="text-border">·</span>
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>
                <strong className="font-serif text-base font-bold text-foreground">
                  {fmt(stats.members)}
                </strong>{" "}
                {t("hero.statsMembers")}
              </span>
            </p>
          )}
```

This reuses the existing `hero.statsReviews`, `hero.statsTimelines` and `hero.statsMembers` labels, so each number keeps its own styling. No new hero key is needed.

- [ ] **Step 4: Tighten the spacing and type scale**

Apply the mockup's sizes:

- The `<section>` className changes `py-10 sm:py-12 lg:py-16` to `py-5 sm:py-6 lg:py-8`.
- The inner wrapper gains tighter rhythm: change `max-w-4xl` to `max-w-3xl`.
- The `<h1>` sizes change from `text-3xl sm:text-4xl lg:text-5xl` to `text-[28px] sm:text-4xl lg:text-[40px]`, and its `mb-4` becomes `mb-3`.
- The subtitle `<p>` changes `mb-6 text-base ... sm:text-lg` to `mb-4 text-sm ... sm:text-base`, and `max-w-2xl` becomes `max-w-xl`.
- The search wrapper `<div id="hero-search" ...>` keeps `mb-4`; inside it, the input's `py-3` becomes `py-2.5`.
- The popular-categories row changes `mb-6` to `mb-3` and `text-sm` to `text-[13px]`.

- [ ] **Step 5: Remove now-unused imports**

The deleted decorations were the only users of several icons. Change the lucide import to exactly what the file still references:

```tsx
import { Star, Clock, Users, Search, Package, MessageSquare } from "lucide-react";
```

`ArrowRight`, `Heart` and `Sparkles` are gone. If `Link` is no longer used after Step 2, keep it — the popular-category chips still use it. Verify by searching the file for each name before removing it.

- [ ] **Step 6: Type-check and lint**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json && npm run lint 2>&1 | tail -5
```

Expected: `tsc` clean; lint problem count no higher than the 36-problem baseline.

- [ ] **Step 7: Commit**

```bash
git add fe/src/components/HeroSection.tsx
git commit -m "feat(fe): calmer, tighter hero"
```

---

### Task 7: Frontend — the timeline strip

**Files:**
- Create: `fe/src/components/home/TimelineStrip.tsx`
- Test: none (no frontend test suite; verified by type-check and the manual pass in Task 11)

**Interfaces:**
- Consumes: `ApiReviewListItem.timeline_ratings` (Task 1, Task 4); `home.timelineHeading`, `home.timelineSubtitle`, `home.timelineUpdated`, `home.seeAllReviews` (Task 5).
- Produces: `export function TimelineStrip()` — no props. Task 10 renders it.

- [ ] **Step 1: Create the component**

Create `fe/src/components/home/TimelineStrip.tsx`:

```tsx
import { Link } from "react-router-dom";
import { Clock, Star, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

// The first rating plus at most this many updates, so the trail never wraps.
const MAX_TRAIL = 4;

/** A star chip showing one rating in the trail. The last one is highlighted. */
function TrailChip({ rating, latest }: { rating: number; latest: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold ${
        latest ? "bg-primary/10 text-primary" : "bg-muted text-foreground"
      }`}
    >
      <Star className="h-3 w-3 fill-gold text-gold" />
      {rating}
    </span>
  );
}

export function TimelineStrip() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["home-timelines"],
    queryFn: () =>
      apiFetch<{ data: ApiReviewListItem[]; total: number }>(
        "/reviews?timeline_only=true&sort=latest&limit=6",
      ),
    staleTime: 5 * 60 * 1000,
  });

  const reviews = data?.data ?? [];

  if (isLoading) {
    return (
      <section className="py-8 lg:py-12">
        <div className="container px-4">
          <div className="mb-6 h-14 w-64 rounded-xl bg-muted animate-pulse" />
        </div>
        <div className="flex gap-4 overflow-x-auto px-4 pb-5 container">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[148px] min-w-[240px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  // A silent section: no timeline reviews means no heading either.
  if (reviews.length === 0) return null;

  return (
    <section className="py-8 lg:py-12">
      <div className="container px-4">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
              {t("home.timelineHeading")}
            </h2>
            <p className="text-[13px] text-muted-foreground sm:text-[15px]">
              {t("home.timelineSubtitle")}
            </p>
          </div>
          <Link
            to="/browse"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-medium text-primary sm:inline-flex"
          >
            {t("home.seeAllReviews")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      <div className="container flex snap-x gap-3 overflow-x-auto px-4 pb-5 sm:gap-4">
        {reviews.map((review) => {
          const { icon: Icon, badgeVariant } = getCategoryDisplay(review.category);
          const updates = review.timeline_ratings ?? [];
          const trail = [review.rating, ...updates].slice(-MAX_TRAIL);
          const image = review.images?.[0];

          return (
            <Link
              key={review.id}
              to={`/review/${review.id}`}
              className="group min-w-[240px] max-w-[240px] shrink-0 snap-start rounded-2xl border border-border/60 bg-card p-4 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:min-w-[268px] sm:max-w-[268px]"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {image ? (
                    <img
                      src={image}
                      alt={review.product.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-serif font-semibold text-card-foreground group-hover:text-primary">
                    {review.product.name}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{review.category}</p>
                </div>
              </div>

              <div className="mb-3 flex flex-nowrap items-center gap-1">
                {trail.map((rating, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="h-0.5 w-2.5 rounded-full bg-border" />}
                    <TrailChip rating={rating} latest={i === trail.length - 1} />
                  </div>
                ))}
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {t("home.timelineUpdated", { count: updates.length })}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
```

Note `badgeVariant` is destructured but unused — remove it from the destructuring, keeping only `{ icon: Icon }`, before type-checking.

- [ ] **Step 2: Type-check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean. A complaint about an unused `badgeVariant` means Step 1's note was not applied.

- [ ] **Step 3: Commit**

```bash
git add fe/src/components/home/TimelineStrip.tsx
git commit -m "feat(fe): timeline strip showing how products hold up"
```

---

### Task 8: Frontend — category tiles

**Files:**
- Create: `fe/src/components/home/CategoryTiles.tsx`

**Interfaces:**
- Consumes: `ApiCategory`, `ApiCategoryStat`, `ApiProduct` from `@/lib/api`; `home.categoriesHeading`, `home.categoriesSubtitle`, `home.categoryReviews` (Task 5); the approved-only counts from Task 3.
- Produces: `export function CategoryTiles()` — no props.

- [ ] **Step 1: Create the component**

Create `fe/src/components/home/CategoryTiles.tsx`:

```tsx
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  apiFetch,
  type ApiCategory,
  type ApiCategoryStat,
  type ApiProduct,
} from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

/** Thumbnails of the most-reviewed products in one category, overlapped. */
function ProductStack({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ["home-category-products", slug],
    queryFn: () =>
      apiFetch<{ data: ApiProduct[]; total: number }>(
        `/products?category=${encodeURIComponent(slug)}&sort=review_count&limit=3`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const withImages = (data?.data ?? []).filter((p) => p.image_url);
  if (withImages.length === 0) return null;

  return (
    <div className="mt-auto flex items-center">
      {withImages.map((product, i) => (
        <img
          key={product.id}
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className={`h-8 w-8 rounded-full border-2 border-card object-cover ${i > 0 ? "-ml-2.5" : ""}`}
        />
      ))}
    </div>
  );
}

export function CategoryTiles() {
  const { t } = useTranslation();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiCategory[]>("/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ["category-stats"],
    queryFn: () => apiFetch<ApiCategoryStat[]>("/categories/stats"),
    staleTime: 5 * 60 * 1000,
  });

  const countOf = (slug: string) =>
    stats.find((s) => s.category === slug)?.review_count ?? 0;

  if (isLoading) {
    return (
      <section className="px-4 py-5 lg:py-8">
        <div className="container grid grid-cols-2 gap-3 px-0 lg:grid-cols-4 lg:gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[150px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (categories.length === 0) return null;

  return (
    <section className="py-5 lg:py-8">
      <div className="container px-4">
        <div className="mb-4 lg:mb-6">
          <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
            {t("home.categoriesHeading")}
          </h2>
          <p className="text-[13px] text-muted-foreground sm:text-[15px]">
            {t("home.categoriesSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
          {categories.map((category) => {
            const { icon: Icon, color } = getCategoryDisplay(category.slug);
            return (
              <Link
                key={category.slug}
                to={`/browse?category=${encodeURIComponent(category.slug)}`}
                className="group flex min-h-[140px] flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated lg:min-h-[160px] lg:gap-4 lg:p-5"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color}`}
                  >
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>

                <div>
                  <p className="font-serif text-xl font-bold text-card-foreground group-hover:text-primary lg:text-[22px]">
                    {category.label}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {t("home.categoryReviews", { count: countOf(category.slug) })}
                  </p>
                </div>

                <ProductStack slug={category.slug} />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Confirm `ApiCategoryStat` is exported**

```bash
grep -n "ApiCategoryStat" fe/src/lib/api.ts
```

Expected: an `export interface ApiCategoryStat` with `category` and `review_count`. It exists today around line 110; if it does not, add it.

- [ ] **Step 3: Type-check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add fe/src/components/home/CategoryTiles.tsx
git commit -m "feat(fe): category tiles with review counts and thumbnails"
```

---

### Task 9: Frontend — latest reviews, trust strip, audience doors

**Files:**
- Create: `fe/src/components/home/LatestReviews.tsx`
- Create: `fe/src/components/home/TrustStrip.tsx`
- Create: `fe/src/components/home/AudienceDoors.tsx`

**Interfaces:**
- Consumes: `ReviewCard`, `CategoryFilter`, `UserAvatar`, `LevelBadge`, `toCardProps`; `rewardsApi.leaderboard` and `LeaderboardEntry` from `@/lib/rewardsApi`; the anonymous leaderboard from Task 2; keys from Task 5.
- Produces: `export function LatestReviews()`, `export function TrustStrip()`, `export function AudienceDoors()` — all without props.

- [ ] **Step 1: Create `LatestReviews.tsx`**

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem } from "@/lib/api";
import { toCardProps } from "@/lib/reviewCardProps";
import { ReviewCard } from "@/components/ReviewCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { useTranslation } from "react-i18next";

export function LatestReviews() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "bn" ? "bn-BD" : "en-US";
  const [activeCategory, setActiveCategory] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["reviews", { category: activeCategory, sort: "latest", limit: 3 }],
    queryFn: () => {
      const params = new URLSearchParams({ sort: "latest", limit: "3" });
      if (activeCategory !== "all") params.set("category", activeCategory);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(`/reviews?${params}`);
    },
  });

  const reviews = data?.data ?? [];

  return (
    <section className="bg-secondary/50 py-7 lg:py-12">
      <div className="container px-4">
        <div className="mb-4 flex items-end justify-between gap-4 lg:mb-6">
          <div>
            <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
              {t("home.latestReviews")}
            </h2>
            <p className="text-[13px] text-muted-foreground sm:text-[15px]">
              {t("home.latestSubtitle")}
            </p>
          </div>
          <Link
            to="/browse"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-medium text-primary sm:inline-flex"
          >
            {t("home.seeAllReviews")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mb-4 lg:mb-6">
          <CategoryFilter activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-3 lg:gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`h-[340px] rounded-2xl bg-muted animate-pulse ${i === 2 ? "hidden md:block" : ""}`}
              />
            ))}
          </div>
        ) : reviews.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3 lg:gap-6">
            {reviews.map((review, index) => (
              <div
                key={review.id}
                // The third card is desktop-only: the phone shows two.
                className={`animate-fade-in ${index === 2 ? "hidden md:block" : ""}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <ReviewCard {...toCardProps(review, locale)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-muted-foreground">{t("home.noReviews")}</p>
        )}

        <div className="mt-6 text-center sm:hidden">
          <Link to="/browse" className="text-sm font-medium text-primary">
            {t("home.seeAllReviews")}
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `TrustStrip.tsx`**

```tsx
import { ShieldCheck, BadgeCheck, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

export function TrustStrip() {
  const { t } = useTranslation();

  const facts = [
    { icon: ShieldCheck, title: t("home.trustModeratedTitle"), body: t("home.trustModeratedBody") },
    { icon: BadgeCheck, title: t("home.trustVerifiedTitle"), body: t("home.trustVerifiedBody") },
    { icon: Clock, title: t("home.trustTimelineTitle"), body: t("home.trustTimelineBody") },
  ];

  return (
    <section className="px-4 pb-2 pt-6 lg:pt-10">
      <div className="container flex flex-col gap-4 rounded-2xl border border-border/60 bg-card px-4 py-4 lg:flex-row lg:gap-8 lg:px-6 lg:py-5">
        {facts.map((fact) => {
          const Icon = fact.icon;
          return (
            <div key={fact.title} className="flex flex-1 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
                <Icon className="h-[18px] w-[18px] text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-card-foreground">{fact.title}</p>
                <p className="text-[13px] leading-snug text-muted-foreground">{fact.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `AudienceDoors.tsx`**

The rewards door calls the leaderboard with an explicit `null` token so `apiFetch` sends no `Authorization` header and an anonymous visitor is never bounced to `/auth`.

```tsx
import { Link } from "react-router-dom";
import { ArrowRight, Trophy, QrCode } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { rewardsApi, type LeaderboardEntry } from "@/lib/rewardsApi";
import { UserAvatar } from "@/components/UserAvatar";
import { useTranslation } from "react-i18next";

/** Five weekly leaders, or null when the leaderboard is empty or unavailable. */
function useTopReviewers() {
  const { data } = useQuery({
    queryKey: ["home-top-reviewers"],
    // Explicit null token: this runs for signed-out visitors too.
    queryFn: () => rewardsApi.leaderboard(null, "week", 5, 0),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const entries = data?.entries ?? [];
  return entries.length > 0 ? entries : null;
}

function TopReviewers({ entries }: { entries: LeaderboardEntry[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary-foreground/85">
        {t("home.topReviewersEyebrow")}
      </p>
      <div className="flex items-start gap-3 lg:gap-4">
        {entries.map((entry) => (
          <div key={entry.user_id} className="flex min-w-0 flex-col items-center gap-1">
            <UserAvatar name={entry.username} src={entry.avatar_url} size="xs" />
            <span className="max-w-[56px] truncate text-[11px] font-medium text-primary-foreground">
              {entry.username.split(" ")[0]}
            </span>
            {/*
              LevelBadge is deliberately not used here. It tints its own
              background from the level's colour, which disappears against the
              warm gradient this card sits on. A white-on-gradient chip keeps
              the level readable; every other surface still uses LevelBadge.
            */}
            {entry.level && (
              <span className="rounded-full bg-white/20 px-1.5 text-[10px] font-semibold text-primary-foreground">
                {entry.level.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AudienceDoors() {
  const { t } = useTranslation();
  const topReviewers = useTopReviewers();

  return (
    <section className="px-4 pb-8 pt-5 lg:pb-16 lg:pt-8">
      <div className="container grid gap-3 px-0 lg:grid-cols-2 lg:gap-6">
        {/* Rewards */}
        <Link
          to="/rewards"
          className="flex flex-col gap-3.5 rounded-2xl bg-gradient-warm p-6 shadow-soft transition-shadow hover:shadow-elevated lg:p-8"
        >
          {topReviewers ? (
            <TopReviewers entries={topReviewers} />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/20">
              <Trophy className="h-6 w-6 text-primary-foreground" />
            </div>
          )}
          <h3 className="font-serif text-[22px] font-bold leading-tight text-primary-foreground lg:text-[26px]">
            {t("home.rewardsHeading")}
          </h3>
          <p className="text-[15px] leading-relaxed text-primary-foreground/85">
            {t("home.rewardsBody")}
          </p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-foreground">
            {t("home.rewardsLink")}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        {/* Business owners */}
        <Link
          to="/owner-register"
          className="flex flex-col gap-3.5 rounded-2xl border border-border/60 bg-card p-6 shadow-soft transition-shadow hover:shadow-elevated lg:p-8"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-primary/10">
            <QrCode className="h-6 w-6 text-primary" />
          </div>
          <h3 className="font-serif text-[22px] font-bold leading-tight text-card-foreground lg:text-[26px]">
            {t("home.ownerHeading")}
          </h3>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{t("home.ownerBody")}</p>
          <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            {t("home.ownerLink")}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean. If `rewardsApi.leaderboard` rejects a `null` first argument, check its signature — it is `(t: string | null, timeframe: string, limit: number, offset: number)`, so `null` is valid.

- [ ] **Step 5: Commit**

```bash
git add fe/src/components/home/LatestReviews.tsx fe/src/components/home/TrustStrip.tsx fe/src/components/home/AudienceDoors.tsx
git commit -m "feat(fe): latest reviews, trust strip and audience doors"
```

---

### Task 10: Frontend — compose the new home page

**Files:**
- Modify: `fe/src/pages/Index.tsx` (replace its contents entirely)

**Interfaces:**
- Consumes: `HeroSection` (Task 6), `TimelineStrip` (Task 7), `CategoryTiles` (Task 8), `LatestReviews`, `TrustStrip`, `AudienceDoors` (Task 9).
- Produces: the new `/` page.

- [ ] **Step 1: Replace the page**

Overwrite `fe/src/pages/Index.tsx` with:

```tsx
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { TimelineStrip } from "@/components/home/TimelineStrip";
import { CategoryTiles } from "@/components/home/CategoryTiles";
import { LatestReviews } from "@/components/home/LatestReviews";
import { TrustStrip } from "@/components/home/TrustStrip";
import { AudienceDoors } from "@/components/home/AudienceDoors";
import { Footer } from "@/components/Footer";

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BdRanks",
  url: typeof window !== "undefined" ? window.location.origin : "https://bdranks.com",
  description:
    "Honest, time-tested product reviews from a real community. Track how products perform over months and years.",
};

const Index = () => (
  <div className="min-h-screen bg-background">
    <PageHead
      title="BdRanks - Honest Reviews Over Time"
      description="Discover honest, time-tested product reviews. Our community tracks products over months and years so you get the full picture before you buy."
      jsonLd={orgSchema}
    />
    <Header autoHide />
    <main>
      <HeroSection />
      <TimelineStrip />
      <CategoryTiles />
      <LatestReviews />
      <TrustStrip />
      <AudienceDoors />
    </main>
    <Footer />
  </div>
);

export default Index;
```

- [ ] **Step 2: Type-check and lint**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json && npm run lint 2>&1 | tail -5
```

Expected: `tsc` clean; lint no worse than the 36-problem baseline.

- [ ] **Step 3: Confirm nothing was orphaned**

```bash
cd fe && for c in FeaturesSection TimelinePreview ReviewedProducts ReviewedProductsGrid; do
  echo "$c -> $(grep -rl "$c" src --include=*.tsx | tr '\n' ' ')"
done
```

Expected: each still referenced by `src/pages/IndexLegacy.tsx` plus its own file. If any is referenced by nothing but its own definition, stop — the legacy page was not preserved correctly.

- [ ] **Step 4: Commit**

```bash
git add fe/src/pages/Index.tsx
git commit -m "feat(fe): compose the redesigned home page"
```

---

### Task 11: Verify end to end

**Files:**
- No source changes expected. If a defect is found, fix it in the file that owns it and note the fix in the commit message.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Full backend check**

```bash
docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./be/... && \
docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./be/... 2>&1 | tail -25
```

Expected: build succeeds; every package `ok` or `no test files`. Record the actual output — do not claim a pass without reading it.

- [ ] **Step 2: Full frontend check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json && npm run build 2>&1 | tail -5
```

Expected: `tsc` prints nothing; the Vite build succeeds.

- [ ] **Step 3: Run the app and check both widths**

Start the frontend dev server from `fe/`:

```bash
cd fe && npm run dev
```

It serves on port 8080 and expects the API at the `VITE_API_BASE_URL` the
project already uses. The backend runs in the existing `be-api-1` container on
this host — it is shared, so do not rebuild or restart it. If the API is not
reachable, say so and stop rather than restarting shared containers.

Open the home page and check, at 375px and 1280px browser widths:

1. The timeline strip is visible below the hero at 375px without scrolling.
2. No horizontal page scroll at either width. Only the timeline strip and the category filter row scroll sideways, inside themselves.
3. Every rating trail fits on one line inside its card.
4. The category tiles show counts, and tapping one lands on `/browse?category=<slug>` with that filter applied.
5. The rewards door shows five reviewers while signed out. Confirm in the browser network tab that `/rewards/leaderboard` returned 200 and the app did NOT redirect to `/auth`.
6. Switching to Bangla with the language switcher translates every new section, with no raw key names such as `home.trustVerifiedTitle` showing through.
7. `/home-old` still renders the previous design, and its page source contains `<meta name="robots" content="noindex, nofollow">`.

- [ ] **Step 4: Record the results**

Write down what passed and what did not. If anything failed, fix it, re-run Steps 1 and 2, and repeat Step 3 for the affected item before continuing.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(fe): <what the manual pass turned up>"
```

Skip this step if the manual pass found nothing. Do not create an empty commit.

- [ ] **Step 6: Report**

Summarise for the user: the six sections live at `/`, the previous design is at `/home-old`, and the three API changes. State plainly that nothing has been pushed, so production is unchanged, and that merging to `main` and pushing is their call.
