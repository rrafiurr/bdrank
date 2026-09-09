# Home Page Product Placement — Design

**Date:** 2026-09-09
**Status:** Approved, ready for implementation planning

## Summary

Admins can control, per product, whether it is pinned to the top of the home
page product carousel, left to the normal ordering, or kept off the home page
entirely. The control lives in the CMS product table and is backed by a single
three-state column.

## Decisions

| Question | Decision |
|---|---|
| Data shape | One `home_placement` enum column (`auto` / `pinned` / `hidden`), not two booleans. Two booleans allow the contradictory "pinned and hidden" state. |
| Pinned product with no reviews | Still appears. Pinning means "force onto the home page", which is what makes it useful for a new or promoted product. |
| Reach of `hidden` | Home page surfaces only: the product carousel and the category tile thumbnails. Search, browse, category listings and the product page are unaffected. |
| Where the rules apply | Only when the caller asks for them, via `placement=home`. The plain product list is unchanged. See "The CMS constraint" below. |
| Ordering | Pinned first, then the requested sort. Within pinned, the requested sort applies. No manual drag ordering. |
| Exposure of the field | `home_placement` is included in the public product payload. It is not sensitive, and the CMS reads the public list endpoint. |

## The CMS constraint

`cms/src/pages/Products.tsx` loads its table from `GET /products?limit=200` —
the **public** endpoint, not an admin one. Filtering hidden products out of
that endpoint would remove them from the CMS as well, leaving no way to
un-hide a product.

Therefore hiding is **opt-in per request**. `GET /products?placement=home`
applies the home page rules; every other call to `/products` behaves exactly
as it does today. This also means search, browse and category pages need no
changes at all.

## Data model

Migration `be/migrations/015_product_home_placement.sql`:

```sql
ALTER TABLE products
  ADD COLUMN home_placement ENUM('auto','pinned','hidden') NOT NULL DEFAULT 'auto';
```

Every existing product defaults to `auto`, so the home page behaves exactly as
it does today until an admin changes something.

`models.Product` gains:

```go
HomePlacement string `json:"home_placement"`
```

## API

### `GET /products` — new `placement` parameter

`placement=home` is the only recognised value. Anything else, including
absence, leaves behaviour unchanged.

When `placement=home`:

- Products with `home_placement = 'hidden'` are excluded.
- `home_placement = 'pinned'` sorts first, then the requested sort applies.

The ORDER BY becomes `(home_placement = 'pinned') DESC, <requested sort>`.

Note the existing `sort` values are unchanged: `review_count` (default),
`avg_rating`, `created_at`, `recent_review`.

The review-count filter stays on the **client**, because "has reviews or is
pinned" is a presentation rule: the carousel keeps a product when
`review_count > 0 || home_placement === 'pinned'`.

### `PATCH /admin/products/{id}` — new field

```json
{ "home_placement": "pinned" }
```

Accepts `auto`, `pinned`, `hidden`. Any other value returns 400 with
`invalid home_placement`, rather than being written to the column. The
existing `name`, `category` and `image_url` fields are unchanged, and the
handler keeps its `COALESCE` pattern so a partial patch touches nothing else.

## Frontend (`fe/`)

`ProductCarousel` requests `/products?placement=home&sort=recent_review&limit=12`.

- Keeps a product when it has at least one review **or** is pinned.
- A pinned product with no reviews shows an em dash in place of the rating
  rather than `0.0`, which would read as a genuine bad score. Its review count
  line shows the zero-review copy.
- No pin badge is shown on the card. Pinning is an editorial decision, not
  something to advertise to visitors.

`CategoryTiles`' `ProductStack` requests
`/products?placement=home&category=<slug>&sort=review_count&limit=3`, so a
hidden product does not surface as a thumbnail either.

`ApiProduct` in `fe/src/lib/api.ts` gains `home_placement: string`.

## CMS (`cms/`)

`cms/src/pages/Products.tsx` gains a **Home page** column between review count
and the action buttons. Each row carries a `Select` with three options:

| Value | Label |
|---|---|
| `auto` | Automatic |
| `pinned` | Pinned |
| `hidden` | Hidden |

Changing the value fires the existing update mutation immediately with only
`{ home_placement }`, shows a toast on success, and invalidates
`["admin-products"]`. No separate save button, matching how the rest of the
table behaves.

`AdminProduct` in `cms/src/lib/api.ts` gains `home_placement: string`.

## Error handling

- An unknown `placement` value is ignored rather than erroring, so a stale
  client cannot break the product list.
- A rejected CMS update shows the existing error toast and the select reverts
  on the next query invalidation.
- The carousel keeps its existing silent-empty behaviour: if every product is
  hidden, the section disappears rather than showing an empty heading.

## Testing

1. Unit: `productOrderBy` still maps the four sorts; a new
   `productPlacementOrder` (or equivalent) returns the pinned-first prefix only
   for `placement=home`.
2. Unit: the admin handler rejects an invalid `home_placement` and accepts the
   three valid values.
3. Integration against a throwaway MySQL with the real migrations, covering: a
   pinned product with zero reviews sorts first and is returned; a hidden
   product is absent under `placement=home` but present without it; ordering
   within the non-pinned group is unchanged.
4. `go build ./...` and `go test ./...` in `be/` via Docker.
5. `npx tsc --noEmit -p tsconfig.app.json` in both `fe/` and `cms/`.
6. Manual: pin a product in the CMS and confirm it leads the carousel; hide one
   and confirm it leaves both the carousel and the category thumbnails while
   still appearing in browse and in the CMS table.

## Out of scope

- Manual drag ordering among pinned products.
- Scheduling a pin between dates.
- Any placement control for reviews, categories or other home page sections.
- A pin indicator visible to site visitors.
