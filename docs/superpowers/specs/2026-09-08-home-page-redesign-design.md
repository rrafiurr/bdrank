# Home Page Redesign — Design

**Date:** 2026-09-08
**Status:** Approved direction, spec under review

## Summary

Replace the seven-section home page with five compact sections that a
first-time shopper can absorb in one short visit. Each section answers one
question a visitor has, in the order they ask it:

1. *What is this and how do I find something?* — calm hero with search
2. *What makes it different?* — a strip of timeline reviews showing ratings over time
3. *Where do I go?* — four category tiles with counts and thumbnails
4. *Is it alive?* — a small block of the latest reviews
5. *Is there anything here for me besides reading?* — two doors: rewards and business owners

The primary audience is the shopper looking for a review. Contributors and
business owners get a clear route in section 5 but do not lead the page.

## Decisions

| Question | Decision |
|---|---|
| Primary visitor | Shopper. Search leads; write-review stays in the header only. |
| Hero decoration | Removed. No floating cards, sparkles, or blob animations. Keep the existing gradient background token. |
| Duplicate product sections | Both removed. Category tiles replace them. |
| Feature-card grid and gradient sign-up banner | Removed. Their message is now shown by sections 2 and 5. |
| Latest reviews count | 3 on desktop, 2 on mobile, then "See all". |
| Timeline strip data | Add per-entry ratings to the review list endpoint (small backend change) rather than fetching each review's detail. |
| Category-stats counting unapproved reviews | Fix as part of this work; the tiles must not show counts the browse page cannot match. |
| Analytics | No new events. Existing pageview tracking is enough. |

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
  `1.2K+ reviews · 340 timelines · 890 members`. Same `fmt` helper, same
  `/stats` query.
- Vertical padding drops so the strip in section 2 is visible on a phone
  without scrolling.

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

This section replaces `ReviewedProducts` and `ReviewedProductsGrid`. Both
components are deleted along with their locale keys, after confirming no
other page imports them (today only `Index` does).

### 4. Latest reviews — `LatestReviews` (extracted)

Move the existing latest-reviews block out of `Index.tsx` into its own
component. Keep `CategoryFilter` and `ReviewCard` exactly as they are.

Change: limit 3 instead of 6. On screens below the `md` breakpoint hide the
third card with a utility class so mobile shows two. The "Load more" button
becomes a "See all reviews" ghost link in the section header, matching the
pattern used by the timeline strip.

### 5. Two doors — `AudienceDoors` (new)

Two side-by-side cards on desktop, stacked on mobile. No data fetching.

- **Rewards door.** Heading "Earn rewards for honest reviews", one sentence
  on points and levels, a static trophy icon from lucide. `LevelBadge` needs
  level data the home page does not have, so it is not used here. Links to
  `/rewards`.
- **Owner door.** Heading "Own a business?", one sentence on the QR poster
  and website widget, a static QR icon, links to `/owner-register`.

Both cards use the existing `bg-gradient-warm` treatment the old CTA banner
used, so the page still ends with a warm accent.

### Removed

- `FeaturesSection` component and its `features.*` locale keys.
- The CTA banner block in `Index.tsx` and its `home.cta*` keys.
- `TimelinePreview` component and its `timelinePreview.*` keys. Only the
  home page imports it.
- `ReviewedProducts`, `ReviewedProductsGrid`, and their `reviewedProducts.*`
  keys.

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
home.rewardsHeading, home.rewardsBody, home.rewardsLink,
home.ownerHeading, home.ownerBody, home.ownerLink,
hero.statsInline (interpolated: "{{reviews}} reviews · {{timelines}} timelines · {{members}} members")
```

Removed keys: `home.featuredTimeline*`, `home.viewAllTimelines`,
`home.productsReviewed*`, `home.topReviewed*`, `home.loadMore`,
`home.cta*`, `hero.startWriting`, `hero.browseReviews`, `hero.sample*`,
`hero.timeline*`, `hero.badge`, `hero.statsReviews/Timelines/Members`,
`features.*`, `reviewedProducts.*`.

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
   asserting `timeline_ratings` order and omission, and a test that
   `CategoryStats` ignores unapproved reviews.
4. Manual check on the dev host at 375px and 1280px widths: the timeline
   strip is visible below the hero on the phone width without scrolling; no
   horizontal page scroll; both languages render; every link resolves.

## Out of scope

- Any change to browse, product, or review-detail pages.
- New analytics events.
- Personalised home content for logged-in users.
- Redesigning `ReviewCard` or `Header`.
