# Text-first ReviewCard design

**Date:** 2026-07-25
**Status:** Approved

## Problem

Customer-uploaded review photos (random phone shots, screenshots, odd aspect
ratios) are displayed as a full-bleed 16:10 hero occupying the top ~55% of
every review card, hard-cropped with `object-cover`
([ReviewCard.tsx](../../../fe/src/components/ReviewCard.tsx)). Low-quality
uploads dominate the home page and make it look bad.

## Decision

Restyle the shared `ReviewCard` component as a **text-first card**
(Trustpilot-style): rating, title, and excerpt dominate; customer photos
shrink to a small thumbnail strip. Applies everywhere `ReviewCard` renders —
home (`Index`), `/browse` (`BrowseReviews`), `/categories` (`Categories`).
The review detail page is out of scope.

## Card layout (top to bottom)

1. **Top row** — star rating + numeric score (left); category badge and,
   when `isTimeline`, the timeline badge (right). These badges previously
   overlaid the hero image.
2. **Title** — unchanged: serif, `line-clamp-2`, hover color shift.
3. **Excerpt** — `line-clamp-4` (was 2); the freed image space goes to the
   review's words.
4. **Photo strip** — rendered only when `images.length > 0`:
   - Up to 2 thumbnails, 64px rounded squares, `object-cover`.
   - A `📷 +N` chip when `images.length > 2`.
   - Thumbnails are **not** independently clickable — the whole card is a
     `<Link>` to the detail page; no nested interactive elements.
   - `loading="lazy"` + `decoding="async"` on thumbnails.
   - `onError` hides a broken thumbnail (no browser broken-image icon).
5. **Footer** — author avatar/name/level badge/date + likes/comments counts,
   unchanged.

## Interface change

`ReviewCardProps.imageUrl: string` → `images: string[]`. The three call
sites update their prop mapping accordingly (each already has the full
`images` array from the list API — `GROUP_CONCAT` in
[review.go](../../../be/internal/repository/review.go) → `images: string[]`
in `api.ts`). **No backend, API, or migration changes.**

## Trade-off accepted

The hero image gave the grid visual rhythm; text cards are plainer. Accepted
mitigations: thumbnails + colored category badges retain some color, and
shorter cards fit more content above the fold.

## Verification

No FE test suite exists. Verify with `npm run lint`, `npm run build`, and
manual check of `/`, `/browse`, `/categories` against reviews with 0, 1, 2,
and 5+ photos.
