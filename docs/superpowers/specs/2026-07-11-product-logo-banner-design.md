# Product Logo & Banner — Design Spec

**Date:** 2026-07-11
**Status:** Approved, ready for implementation planning

## Problem

The home page presents each product using its `image_url`. That column typically holds
a user-uploaded, photo-style image, which is cropped with `object-cover` and often looks
messy — a poor first impression for visitors landing on the site.

We want the home page to show a clean **brand logo** for each product instead, fitted
nicely rather than cropped. When a product has no logo, show a **styled per-category
placeholder** (not the user image). Separately, products gain a wide **banner** used as
the hero on the product detail page.

## Goals

- Add `logo_url` and `banner_url` to products.
- Home page product cards show the logo, fitted cleanly; fall back to a styled category
  placeholder when there is no logo. The user-style `image_url` is no longer featured on
  the home page.
- Product detail page gains a banner-based hero.
- Both admins (CMS) and verified product owners (FE) can upload a product's logo/banner.
- Logo and banner files are stored in **separate upload subfolders**
  (`uploads/logos/`, `uploads/banners/`); review images keep using `uploads/`.

## Non-goals

- Renaming, migrating, or removing the existing `image_url` column — it stays as-is for
  backward compatibility (e.g. product JSON-LD). It is simply no longer featured on the
  home page.
- Letting product owners edit product name/category (remains admin-only).
- Image cropping/resizing pipelines — files are stored as uploaded.

## Backend

### 4.1 Data model

New migration `be/migrations/009_product_brand_assets.sql`:

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS logo_url   VARCHAR(500) NULL AFTER image_url,
  ADD COLUMN IF NOT EXISTS banner_url VARCHAR(500) NULL AFTER logo_url;
```

`models.Product` gains:

```go
LogoURL   string `json:"logo_url,omitempty"`
BannerURL string `json:"banner_url,omitempty"`
```

`models.ProductRef` is left unchanged — the home-page cards fetch products directly from
`GET /products`, and the detail hero uses the full `Product` from `GET /products/{id}`, so
no review-embedded payload needs the logo/banner. This keeps the review queries untouched.

`repository/product.go`:
- `List` and `FindByID` SELECT and scan `COALESCE(logo_url,'')` and `COALESCE(banner_url,'')`
  into the new fields, and include them in the `GROUP BY`.

### 4.2 Storage — separate folders

`storage.Storage` interface `Store` signature changes to accept a subdir:

```go
Store(ctx context.Context, r io.Reader, originalFilename, subdir string, maxBytes int64) (string, error)
```

`LocalStorage`:
- `Store` joins `subdir` under `uploadDir`, `MkdirAll`s the target dir, and returns a
  relative path like `uploads/logos/<random>.jpg`. Empty `subdir` preserves current
  `uploads/<file>` behavior.
- `Delete` must handle sub-paths safely: strip the leading `uploads/`-style prefix relative
  to `uploadDir`, `filepath.Clean` it, reject any path that escapes `uploadDir` (contains
  `..` after cleaning or resolves outside the dir), then remove. This replaces the current
  `filepath.Base(path)` logic, which silently fails to delete files in subfolders.

Only `LocalStorage` implements the interface, so this is the sole implementation to update.

### 4.3 Upload endpoint

`UploadHandler.Image` reads an optional `folder` form field. Allowlist:

| `folder` value | subdir passed to Store |
|----------------|------------------------|
| `logos`        | `logos`                |
| `banners`      | `banners`              |
| `` (absent)    | `` (default `uploads/`)|
| anything else  | 400 error              |

Both existing routes reuse this handler:
- `POST /upload/image` (authenticated users — owners use this)
- `POST /admin/upload/image` (admins)

The static file server `/uploads/*` already serves nested paths — no change.

### 4.4 Admin product endpoints

`AdminHandler.CreateProduct` and `UpdateProduct` accept `logo_url` and `banner_url`:
- Create: `INSERT INTO products (name, category, image_url, logo_url, banner_url)
  VALUES (?, ?, NULLIF(?,''), NULLIF(?,''), NULLIF(?,''))`.
- Update: extend the `COALESCE`-based `UPDATE` with `logo_url` and `banner_url` (pointer
  fields, same pattern as the existing optional fields).

### 4.5 Owner product endpoint

New: `PATCH /profile/products/{id}` (authenticated, verified-owner group).

- Body: `{ "logo_url": string|null, "banner_url": string|null }` — **only** these two fields.
- Guard: `products.OwnedBy(ctx, id, userID)` must be true, else 403 `product not found`.
  Verified-owner check via `users.IsVerifiedOwner` (consistent with other owner endpoints).
- `UPDATE products SET logo_url = COALESCE(?, logo_url), banner_url = COALESCE(?, banner_url)
  WHERE id = ? AND owner_id = ?`. Returns the updated product.
- Route registered in the authenticated group in `router.go` next to `GET /profile/products`.

`ProfileHandler.MyProducts` SELECT gains `logo_url`, `banner_url`, returned as
`logo_url`/`banner_url` in the JSON list, so the owner dashboard can preview current assets.

## Frontend (public app — `fe/`)

### 5.1 Shared `ProductLogo` component

New `fe/src/components/ProductLogo.tsx`. Props: `{ logoUrl?: string; category: string;
name: string; className?: string }`.

- When `logoUrl` is set: render `<img src={logoUrl}>` centered with `object-contain` and
  padding on a soft, category-tinted background, so any logo shape/aspect fits cleanly
  (no cropping).
- When empty: render a **styled category placeholder** — a category-tinted gradient
  background + the category icon (physical→Package, digital→Monitor, service→Briefcase) +
  the product name. Deterministic tint per category so the grid reads as one system.

This single component is used by both home-page card grids to keep them consistent.

### 5.2 Home page cards

`ReviewedProducts.tsx` and `ReviewedProductsGrid.tsx`: replace the current
`image_url ? <img object-cover> : <Icon>` block with `<ProductLogo logoUrl={product.logo_url}
category={product.category} name={product.name} />`. Remove the now-unused local
`categoryIcon`/`image_url` usage where superseded (icon logic moves into `ProductLogo`).

### 5.3 Product detail hero

`ProductReviews.tsx`: the plain text product header becomes a hero.
- If `product.banner_url`: wide background image with a gradient scrim for text legibility;
  product name, category badge, and rating overlaid; logo shown as a small badge/avatar.
- If no banner: category-tinted placeholder banner (reuse the placeholder styling).
- Preserve existing content (badge, name, star rating, review count, "Write review" button).

### 5.4 Owner dashboard — brand assets

`OwnerDashboard.tsx`: add a "Brand assets" panel for the selected owned product
(verified owners only).
- Shows current logo + banner previews (from `/profile/products`).
- Upload logo → `POST /upload/image` with `folder=logos`; upload banner → `folder=banners`.
- Save → `PATCH /profile/products/{id}` with the resulting URLs.
- Invalidate the `owner-products` query on success.

### 5.5 Types

`fe/src/lib/api.ts`:
- `ApiProduct`: add `logo_url: string; banner_url: string;`. This is what the home cards
  (`GET /products`) and the detail hero (`GET /products/{id}`) consume.
- `ApiOwnerProduct`: add `logo_url?: string; banner_url?: string;`.

Review payloads (`ApiReviewListItem.product`, `ApiReviewDetail.product`) are left
unchanged — they don't carry logo/banner (see backend note on `ProductRef`).

## CMS (`cms/`)

`cms/src/lib/api.ts`:
- `AdminProduct` gains `logo_url` and `banner_url`.
- `uploadImage(file, folder?)` gains an optional `folder` argument, sent as a form field.

`cms/src/pages/Products.tsx`:
- `ProductForm` gains `logo_url` and `banner_url`.
- Create/edit dialog: add logo and banner upload fields (file input → `uploadImage` with
  `logos`/`banners`), with a small preview and the resolved URL. Keep the existing
  `image_url` field as-is.
- Create/edit mutations send the new fields.

## Data flow summary

```
Admin (CMS)  --upload--> POST /admin/upload/image?folder=logos --> uploads/logos/x.jpg
             --save-----> POST/PATCH /admin/products  (logo_url, banner_url)

Owner (FE)   --upload--> POST /upload/image (folder=banners) --> uploads/banners/y.jpg
             --save-----> PATCH /profile/products/{id} (owner-guarded)

Home page    <-- GET /products (logo_url) --> ProductLogo (logo OR category placeholder)
Detail page  <-- GET /products/{id} (banner_url) --> hero (banner OR placeholder)
```

## Testing

**Backend**
- Migration applies cleanly; re-running is idempotent (`IF NOT EXISTS`).
- `GET /products` and `GET /products/{id}` include `logo_url`/`banner_url`.
- `PATCH /profile/products/{id}`: owner updates own product's logo/banner; non-owner gets
  403; unverified owner gets 403; name/category cannot be changed via this route.
- Admin create/update persist logo/banner.
- Upload: `folder=logos`/`banners` store under the right subdir; unknown `folder` → 400;
  absent `folder` stores in `uploads/`.
- `Delete` removes a file stored in a subfolder; rejects/ignores traversal paths; still
  no-ops for empty and `http` paths.

**Frontend (manual)**
- Home cards show fitted logo when present, styled category placeholder when absent —
  consistent across both grids.
- Product detail hero shows banner when present, placeholder banner when absent.
- Owner dashboard: upload logo + banner, save, reload shows persisted assets.
- CMS: create/edit product with logo + banner; verify files land in `uploads/logos/` and
  `uploads/banners/`.

## Risks / notes

- Changing the `Storage.Store` signature touches the interface — only `LocalStorage`
  implements it, and the upload handler is the only caller, so the blast radius is small.
- The `Delete` change is the subtlest part; it must not regress traversal protection.
- `image_url` remains in payloads; frontend simply stops featuring it on the home page.
