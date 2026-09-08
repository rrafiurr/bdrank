# Home Page Redesign — Design

**Date:** 2026-09-08
**Status:** Approved direction, spec under review

## Summary

Replace the seven-section home page with six compact sections that a
first-time shopper can absorb in one short visit. Each section answers one
question a visitor has, in the order they ask it:

1. *What is this and how do I find something?* — calm hero with search
2. *What makes it different?* — a strip of timeline reviews showing ratings over time
3. *Where do I go?* — four category tiles with counts and thumbnails
4. *Is it alive?* — a small block of the latest reviews
5. *Can I trust it?* — a one-row trust strip
6. *Is there anything here for me besides reading?* — two doors: rewards (with this week's top reviewers) and business owners

The primary audience is the shopper looking for a review. Contributors and
business owners get a clear route in section 6 but do not lead the page.

A visual mockup of both the desktop and phone layouts lives in the design
canvas at https://claude.ai/code/artifact/a0a15fd3-8963-4cac-9439-014a69aaea14.
Sizes below follow the mockup.

## Decisions

| Question | Decision |
|---|---|
| Primary visitor | Shopper. Search leads; write-review stays in the header only. |
| Hero decoration | Removed. No floating cards, sparkles, or blob animations. Keep the existing gradient background token. |
| Duplicate product sections | Both removed. Category tiles replace them. |
| Feature-card grid and gradient sign-up banner | Removed. Their message is now shown by sections 2, 5 and 6. |
| Trust facts | One compact row of three facts (moderation, verified owners, timeline authenticity) rather than the old six feature cards. |
| Top reviewers | Shown inside the rewards door from the weekly leaderboard, not as a separate section. Requires opening the leaderboard endpoint to anonymous visitors. |
| Active campaign banner, community photo strip | Considered and deferred. Not in this work. |
| Latest reviews count | 3 on desktop, 2 on mobile, then "See all". |
| Timeline strip data | Add per-entry ratings to the review list endpoint (small backend change) rather than fetching each review's detail. |
| Category-stats counting unapproved reviews | Fix as part of this work; the tiles must not show counts the browse page cannot match. |
| Analytics | No new events. Existing pageview tracking is enough. |
| The old home page | Kept, not deleted. It moves to `fe/src/pages/IndexLegacy.tsx` and stays reachable at `/home-old`, marked noindex and disallowed in `robots.txt`. The new design takes `Index.tsx` and `/`. |
| Components the old page uses | All retained, because the legacy page still renders them. Nothing is deleted in this work. |

## Page structure

All sections live in `fe/src/pages/Index.tsx`, which becomes a thin
composition of section components. Every section is self-contained: it owns
its query, its loading skeleton, and its empty state, and takes no props.

### 1. Hero — `HeroSection` (rewritten)

Keep from today: headline, subtitle, search box with live suggestions, four
category chips, the public stats query.

Change:

- Remove the decorative layers (blobs, sparkles, floating sample cards).
- Remove the "Start writing" and "Browse reviews" buttons. The header already
  carries "Write a review"; the search box submits to browse.
- Stats become one quiet inline strip under the chips, in muted text:
  `1.2K+ reviews · 340 timelines · 890 members`, built from the existing
  `hero.statsReviews`, `hero.statsTimelines` and `hero.statsMembers` labels so
  each number keeps its own styling. Same `fmt` helper, same `/stats` query.
- Vertical padding drops so the strip in section 2 is visible on a phone
  without scrolling. Mockup sizes: headline 40px desktop / 28px phone on a
  single line where it fits, section padding 32px top / 26px bottom on
  desktop and 20px / 18px on phone, search bar 50px tall on desktop and 46px
  on phone.

The search dropdown logic is untouched. If it is convenient during
implementation, the search form and its dropdown may be extracted into a
`HeroSearch` component; this is optional.

### 2. Timeline strip — `TimelineStrip` (new)

Horizontal, snap-scrolling row of up to 6 cards. Query:
`/reviews?timeline_only=true&sort=latest&limit=6`.

Each card links to `/review/:id` and shows:

- Product image, or the review's first image, or the category icon fallback.
- Product name (one line, clamped).
- A rating trail: the original rating followed by each timeline entry's
  rating, rendered as a row of small star values with a thin connector, for
  example `★5 → ★4 → ★4`. Ratings come from the new `timeline_ratings` field
  (see API). Show at most the first rating and the last three entries so the
  trail never wraps.
- A caption with the entry count: "Updated 3 times" (localized, plural-aware).

Section heading: "How it holds up" with a subtitle of one sentence explaining
that reviewers come back and update. A "See all reviews" link goes to
`/browse`. The browse page has no timeline filter today and adding one is out
of scope.

Empty state: the section renders nothing when there are zero timeline
reviews. The page must not show an empty heading.

### 3. Category tiles — `CategoryTiles` (new)

A 2×2 grid on mobile, 4-across on desktop. One tile per category from
`/categories` (slug + label). Each tile shows:

- Category icon and color from `getCategoryDisplay`.
- Label.
- Review count from `/categories/stats`, formatted with the same `fmt` helper
  as the hero stats. Categories with no stats row show 0.
- Up to three product thumbnails from `/products?category=<slug>&sort=review_count&limit=3`,
  overlapped as a small avatar stack. Products with no image are skipped.

The whole tile is a link to `/browse?category=<slug>`.

Loading: four pulse skeletons. Empty: if `/categories` returns nothing the
section renders nothing.

This section replaces `ReviewedProducts` and `ReviewedProductsGrid` on the
home page. Both components stay in the codebase because `IndexLegacy` still
renders them.

### 4. Latest reviews — `LatestReviews` (extracted)

Move the existing latest-reviews block out of `Index.tsx` into its own
component. Keep `CategoryFilter` and `ReviewCard` exactly as they are.

Change: limit 3 instead of 6. On screens below the `md` breakpoint hide the
third card with a utility class so mobile shows two. The "Load more" button
becomes a "See all reviews" ghost link in the section header, matching the
pattern used by the timeline strip.

### 5. Trust strip — `TrustStrip` (new)

One bordered card containing three items in a row on desktop, stacked on
mobile. Each item is a small primary-tinted icon, a bold title, and one
sentence. No data fetching.

- Shield icon. "Checked by a human". Every review and comment is moderated
  before it counts.
- Badge-check icon. "Verified owners". Businesses are vetted before they get
  a badge.
- Clock icon. "Timelines can't be faked". Updates come from real buyers
  months after purchase.

Sits directly above the two doors.

### 6. Two doors — `AudienceDoors` (new)

Two side-by-side cards on desktop, stacked on mobile.

- **Rewards door.** An uppercase eyebrow "This week's top reviewers", then a
  row of five reviewers from `/rewards/leaderboard?timeframe=week&limit=5`:
  `UserAvatar`, first name, and their level name in a white-on-gradient chip.
  `LevelBadge` is not used here: it tints its background from the level's own
  colour, which vanishes against the warm gradient the card sits on. Below that the
  heading "Earn rewards for honest reviews", one sentence on points and
  levels, and a link to `/rewards`. If the leaderboard returns fewer than
  five entries, show what it returns. If it returns none or fails, the door
  falls back to a static trophy icon in place of the reviewer row so the
  card still renders.
- **Owner door.** Heading "Own a business?", one sentence on the QR poster
  and website widget, a static QR icon, links to `/owner-register`.

Both cards use the existing `bg-gradient-warm` treatment the old CTA banner
used, so the page still ends with a warm accent.

### Not on the new page, but kept in the codebase

The new home page does not render these. They are not deleted, because
`IndexLegacy` at `/home-old` still does:

- `FeaturesSection` and its `features.*` locale keys.
- `TimelinePreview` and its `timelinePreview.*` keys.
- `ReviewedProducts`, `ReviewedProductsGrid`, and their `reviewedProducts.*`
  keys.
- The old CTA banner markup and its `home.cta*` keys, which live inside
  `IndexLegacy`.

### The legacy page

`fe/src/pages/Index.tsx` is moved verbatim to `fe/src/pages/IndexLegacy.tsx`
with only three changes: the component and its default export are renamed to
`IndexLegacy`, its `PageHead` gains `noindex`, and its title becomes
"BdRanks - Home (previous design)". It is routed at `/home-old` in
`fe/src/App.tsx` and added to `fe/public/robots.txt` as a `Disallow` line. It
is not linked from anywhere in the UI. The sitemap is unchanged, since it
lists routes explicitly and never included `/home-old`.

## API changes

### `GET /reviews` — add `timeline_ratings`

Add an optional field to the list item:

```json
"timeline_ratings": [4, 4, 3]
```

Ordered by `timeline_entries.created_at ASC`, then `id ASC`. Omitted (not an
empty array) when the review has no entries. Populated only when
`timeline_only=true` so the general list query pays nothing.

Implementation: in `ReviewRepo.List`, when `f.TimelineOnly` is set, add
`GROUP_CONCAT(te.rating ORDER BY te.created_at, te.id)` to the select list and
split it in the scan loop, the same way `images` is handled today. Add
`TimelineRatings []int` with `json:"timeline_ratings,omitempty"` to
`models.Review`. Add the field to `ApiReviewListItem` in `fe/src/lib/api.ts`.

The frontend rating trail is `[review.rating, ...timeline_ratings]`.

### `GET /rewards/leaderboard` — allow anonymous callers

Today the route is inside the JWT-required group in
`be/internal/rewards/routes.go`. Move it out of that group and mount it with
the optional-auth middleware instead, so `RegisterRoutes` gains an
`optionalAuth` parameter alongside `auth` and `admin`. The handler already
reads the user id from context and tolerates zero: anonymous callers get the
ranked list with no `is_me` row and no `me` block. Nothing else about the
endpoint changes, and the logged-in rewards page keeps its current behavior.

### `GET /categories/stats` — count only approved reviews

Today `ProductRepo.CategoryStats` joins reviews with no `is_approved` filter,
so the tiles would show counts higher than the browse page. Change the join
condition to `LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1`.
This is the only place the endpoint is consumed on the public site
(`Categories` page also uses it, and benefits from the fix).

## Locale keys

New keys under `home` in both `en` and `bn` translation files:

```
home.timelineHeading, home.timelineSubtitle, home.seeAllTimelines,
home.timelineUpdated (plural: "Updated {{count}} time" / "times"),
home.categoriesHeading, home.categoriesSubtitle,
home.seeAllReviews,
home.trustModeratedTitle, home.trustModeratedBody,
home.trustVerifiedTitle, home.trustVerifiedBody,
home.trustTimelineTitle, home.trustTimelineBody,
home.topReviewersEyebrow,
home.rewardsHeading, home.rewardsBody, home.rewardsLink,
home.ownerHeading, home.ownerBody, home.ownerLink,
home.latestSubtitle, home.categoryReviews (plural)
```

No locale keys are removed. The new keys are added alongside the existing
ones, which `IndexLegacy` still uses.

Bangla copy is written alongside English in the same task, not deferred.

## SEO

`PageHead` title, description, and the Organization JSON-LD are unchanged.
The `h1` stays in the hero. Every section heading is an `h2`.

## Error handling

Each section's query failure is treated like its empty state: the section
disappears rather than showing an error. The hero search keeps its existing
behavior. The page never shows a full-page error because one section failed.

## Testing

There is no frontend test suite. Verification is:

1. `npx tsc --noEmit -p tsconfig.app.json` passes in `fe/`.
2. `npm run lint` passes in `fe/`.
3. Backend: `go test ./...` in `be/` via Docker, plus a new repository test
   asserting `timeline_ratings` order and omission, a test that
   `CategoryStats` ignores unapproved reviews, and a handler test that
   `/rewards/leaderboard` answers without a token.
4. Manual check on the dev host at 375px and 1280px widths: the timeline
   strip is visible below the hero on the phone width without scrolling; no
   horizontal page scroll; both languages render; every link resolves.

## Out of scope

- Any change to browse, product, or review-detail pages.
- New analytics events.
- An active-campaign banner and a community photo strip (deferred).
- Personalised home content for logged-in users.
- Redesigning `ReviewCard` or `Header`.
