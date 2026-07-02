# BdRanks Frontend — SEO Audit Report

**Date:** 2026-07-02
**Scope:** `fe/` (React 18 + Vite SPA), plus `deploy/nginx/reviewhub.conf` and `public/` assets where they affect SEO.

---

## What's already good

- Every page except `EmbedPage` uses a shared [PageHead](../fe/src/components/PageHead.tsx) component: per-page `<title>`, meta description, canonical, OG/Twitter tags.
- Private pages (`/auth`, `/profile`, `/write-review`, owner pages, 404) are correctly `noindex`.
- JSON-LD structured data exists: `Product` + `AggregateRating` + `BreadcrumbList` on product pages, `Review` on review pages, `Article` on static pages, `Organization` on the homepage.
- `robots.txt` exists and disallows most private routes.
- Homepage has a proper `<h1>`; pages use semantic `<main>`, `<section>`, `<article>`.
- Images consistently have meaningful `alt` text.
- `document.documentElement.lang` updates with the i18n language.
- Favicons + apple-touch-icon are complete.

---

## Findings

### 🔴 Critical

#### 1. Fully client-side rendered — crawlers see an empty page
All content (products, reviews, static pages) is fetched client-side from `api.bdranks.com` via React Query. The HTML served by nginx is an empty `<div id="root">` for **every** route.

- Social crawlers (Facebook, WhatsApp, Twitter/X, LinkedIn, Telegram) **do not run JavaScript** — every shared `/review/:id` or `/product/:id` link shows the generic homepage title/description, never the per-page OG tags Helmet sets.
- Google renders JS but on a delayed second-wave budget; a review site's long-tail pages are exactly what gets deprioritized.

**Fix options** (pick one):
- **Prerender at the edge** — nginx detects bot user-agents and proxies to a prerender service (Prerender.io, or self-hosted `prerender` container alongside the Go API). Lowest-effort, no app rewrite.
- **Build-time prerendering** (`vite-plugin-ssr` / `vike`) for static routes + bot-proxy for dynamic ones.
- **Migrate to a metaframework** (Next.js/Remix) with SSR. Highest effort, best long-term result.

#### 2. Sitemap is invalid and near-empty
[sitemap.xml](../fe/public/sitemap.xml) uses **relative** `<loc>` values (`/`, `/browse`) — the sitemap protocol requires fully-qualified absolute URLs, so search engines will reject the file. It also lists only 3 static routes; no `/product/:id`, `/review/:id`, or `/page/:slug` URLs — the pages that actually matter are undiscoverable via sitemap.

**Fix:** generate the sitemap dynamically from the Go backend (products, reviews, published static pages) and route `bdranks.com/sitemap.xml` to it in nginx. Use absolute `https://bdranks.com/...` URLs and real `<lastmod>` dates.

#### 3. Hardcoded canonical to homepage in index.html
[index.html:26](../fe/index.html#L26) ships `<link rel="canonical" href="https://bdranks.com">` on **every route**. Helmet adds its own canonical at runtime but does not remove the static one — so pages have two canonicals, and any crawler that doesn't execute JS sees every URL canonicalized to the homepage (i.e. "don't index this page, index the homepage instead").

**Fix:** delete the static canonical (and the static OG/Twitter/description tags — see #7) from `index.html` and let `PageHead` own them; or solve properly via prerendering (#1).

### 🟠 High

#### 4. Canonical built from `window.location.href`
[PageHead.tsx:29](../fe/src/components/PageHead.tsx#L29) defaults the canonical to the full current URL — including query strings, hashes, `www.` vs apex, and `http` vs `https`. `/browse?category=digital&sort=latest` self-canonicalizes with all params, multiplying duplicate URLs instead of consolidating them.

**Fix:** build canonicals from a `SITE_URL` constant (`https://bdranks.com`) + `location.pathname` only. Add explicit `canonical` props where a query param is meaningful (e.g. `/categories?type=digital`).

#### 5. No host canonicalization at the server
nginx serves `bdranks.com` and `www.bdranks.com` identically with no 301 redirect ([reviewhub.conf:4](../deploy/nginx/reviewhub.conf#L4)), and the config shows no HTTP→HTTPS redirect. Four URL variants of every page can be crawled.

**Fix:** add a `server` block that 301-redirects `www.bdranks.com` → `bdranks.com` (and HTTP → HTTPS if certbot didn't add it).

#### 6. `robots.txt` issues
- `Sitemap: /sitemap.xml` — the Sitemap directive must be an **absolute** URL.
- Missing disallows for `/owner-dashboard`, `/owner-qr`, `/owner-embed`, `/embed/` (token URLs — indexing them leaks tokens and creates duplicate content).

#### 7. Static meta tags in index.html duplicate Helmet's
Helmet appends its own `description`/OG/Twitter tags without removing the static ones in [index.html:13-24](../fe/index.html#L13-L24), so every page ends up with two `meta description`s, two `og:title`s, etc. Also in the static set:
- `og:image` is a **relative** path (`/og-image.png`) — OG requires absolute URLs; the image is broken for scrapers.
- `og:url` is missing.
- `meta keywords` is obsolete — remove it.

**Fix:** slim `index.html` to charset/viewport/icons/title only and let `PageHead` own the rest. Give `PageHead` a **default absolute og:image** (currently pages without an explicit `ogImage` have none at all, and `ogImage={review.images?.[0]}` may pass a relative API path — normalize to absolute).

#### 8. EmbedPage has no meta at all
[EmbedPage.tsx](../fe/src/pages/EmbedPage.tsx) is the only page without `PageHead`. `/embed/:token` pages are indexable duplicate content.

**Fix:** add `<PageHead title="…" noindex />`, plus the robots.txt disallow (#6). Ideally also send `X-Robots-Tag: noindex` from nginx for `/embed/`.

### 🟡 Medium

#### 9. Performance / Core Web Vitals
- **Single 696 KB JS bundle** — all 16 pages are eagerly imported in [App.tsx](../fe/src/App.tsx). Split routes with `React.lazy()`; the owner/CMS-ish pages especially don't belong in the public bundle.
- **`logo.png` is 2.1 MB and `logo-tight.png` is 566 KB** — these load in the header/footer of every page. Resize to display dimensions and export as WebP; should be < 20 KB each.
- **Google Fonts via CSS `@import`** ([index.css:5](../fe/src/index.css#L5)) — creates a render-blocking request chain (CSS → fonts CSS → font files). Move to `<link rel="preconnect">` + `<link rel="stylesheet">` in `index.html`, or self-host with `@fontsource`.
- **No `loading="lazy"` / `decoding="async"` / width+height** on any `<img>` (review cards, product grids). Below-the-fold images should lazy-load; missing dimensions cause CLS.

#### 10. 404s return HTTP 200
The SPA fallback (`try_files … /index.html`) means unknown URLs and deleted products/reviews return `200` — soft-404s. The `noindex` on `NotFound` helps but only after JS runs. Full fix comes with prerendering (#1); until then this is a known limitation worth tracking.

#### 11. Structured data gaps
- `Product` schema omits `description` and emits `AggregateRating` even when `review_count` is 0 — an aggregate rating with zero reviews is invalid and risks a rich-result penalty. Omit `aggregateRating` when there are no reviews.
- Standalone `Review` schema on `/review/:id`: Google prefers reviews nested in the `itemReviewed` `Product` (with the product's own data). Consider restructuring.
- `Organization` schema has no `logo` — required for the logo rich result.
- No `WebSite` schema with `SearchAction` on the homepage (enables the sitelinks search box; the site has search on `/browse`).

#### 12. Bangla content is invisible to search
The site is bilingual (en/bn) but language is a client-side toggle on the **same URLs** — crawlers only ever index the default English. For a Bangladesh-market site ("BdRanks"), Bangla queries are likely a major traffic source.

**Fix (strategic, larger):** language-scoped URLs (`/bn/...` or `?lang=bn`) + `hreflang` alternates. Decide whether Bangla SEO matters before investing.

#### 13. Filtered/category views aren't crawlable as pages
`/browse` filters (category, rating, search) live in React state, not the URL, so there are no indexable "Best digital product reviews"-style listing URLs and no shareable filtered links. `/categories?type=…` exists but is thin. Consider promoting category listings to real paths (`/browse/digital`) with their own titles/descriptions.

---

## Task list

### P0 — do first
- [ ] **Fix sitemap**: absolute URLs; generate dynamically from the backend (products, reviews, static pages) with `lastmod`; serve at `bdranks.com/sitemap.xml` via nginx proxy.
- [ ] **Fix robots.txt**: absolute Sitemap URL; add disallows for `/owner-dashboard`, `/owner-qr`, `/owner-embed`, `/embed/`.
- [ ] **Remove the hardcoded homepage canonical** (and duplicate description/OG/Twitter/keywords tags) from `index.html`.
- [ ] **Fix PageHead canonicals**: `SITE_URL + pathname` instead of `window.location.href`; add a default absolute og:image; normalize `ogImage` values to absolute URLs.
- [ ] **nginx**: 301 `www` → apex (and HTTP → HTTPS if not already handled by certbot).
- [ ] **Add `PageHead` with `noindex` to `EmbedPage`** (+ `X-Robots-Tag: noindex` for `/embed/` in nginx).

### P1 — high impact
- [ ] **Solve crawlability of client-rendered content**: add bot-detection prerendering in nginx (self-hosted Prerender container is the pragmatic choice), or commit to SSR/prerendering at the framework level. This unblocks social sharing previews and reliable Google indexing.
- [ ] **Compress the logos** (2.1 MB → ~15 KB WebP) and audit `og-image.png`.
- [ ] **Code-split routes** with `React.lazy()` in `App.tsx`.
- [ ] **Fix font loading**: replace the CSS `@import` with preconnect + link tags or self-hosted fonts.
- [ ] **Image hygiene**: `loading="lazy"` + `decoding="async"` + explicit `width`/`height` on review/product card images.

### P2 — structured data & content
- [ ] Omit `aggregateRating` when `review_count === 0`; add `description` to Product schema.
- [ ] Nest `Review` inside `Product` (`itemReviewed`) on review detail pages.
- [ ] Add `logo` to the Organization schema; add `WebSite` + `SearchAction` schema on the homepage.
- [ ] Promote browse filters to crawlable URLs (e.g. `/browse/digital`) with unique titles/descriptions; sync filter state to URL params so filtered views are shareable.

### P3 — strategic
- [ ] Decide on Bangla SEO: if yes, move to language-scoped URLs (`/bn/...`) with `hreflang` alternates — this pairs naturally with the SSR/prerender decision in P1.
- [ ] After P0/P1 ship: verify in Google Search Console (submit sitemap, run URL inspection on a product page and a review page, confirm rendered HTML and rich results).

---

## Verification checklist (after fixes)

1. `curl -A "facebookexternalhit/1.1" https://bdranks.com/review/<id>` returns correct OG tags in raw HTML.
2. `curl https://bdranks.com/sitemap.xml` returns absolute URLs including products/reviews.
3. `curl -I http://www.bdranks.com/` returns `301` to `https://bdranks.com/`.
4. Google Rich Results Test passes on a product page and a review page.
5. Lighthouse SEO score ≥ 95 and LCP < 2.5 s on `/` and a product page.
