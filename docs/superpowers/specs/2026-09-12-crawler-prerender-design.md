# Crawler-Rendered HTML — Design

**Date:** 2026-09-12
**Status:** Approved design, not yet implemented
**Scope:** `be/` (new render path), `deploy/nginx/` (hand-applied), `fe/public/og-image.png`
**Estimate:** 3–4 days

---

## 1. The problem

Every route on `bdranks.com` returns the same static shell. Verified against production on
2026-09-12:

```
$ curl -s -A "facebookexternalhit/1.1" https://bdranks.com/review/50 | grep -c 'og:'
0
$ curl -s -A "facebookexternalhit/1.1" https://bdranks.com/review/50 | grep '<title>'
    <title>BdRanks - Honest Reviews Over Time</title>
```

So a review link shared into a Facebook group, Messenger thread or WhatsApp chat shows the
generic site title, **no description and no image** — indistinguishable from a dead link.
Facebook, WhatsApp, Telegram, LinkedIn and X do not execute JavaScript, so the per-page tags
that [`PageHead`](../../../fe/src/components/PageHead.tsx) sets at runtime never reach them.
Googlebot does render JS, but on a delayed second-wave budget that deprioritises exactly the
long-tail review pages this site lives on.

Facebook groups and Messenger are the primary distribution channel for this market
([INCOME_MODEL.md §3.4](../../INCOME_MODEL.md)), so this is the single highest-leverage fix
available: the share affordance already exists, it just produces a link that looks broken.

This also carries three findings from [SEO_REPORT.md](../../SEO_REPORT.md): the crawlability
of client-rendered content (#1), soft-404s returning HTTP 200 (#10), and an
`aggregateRating` emitted with zero reviews (#11).

### Goals

1. A shared link to a review, product or CMS page unfurls with the right title, description
   and image.
2. Googlebot and Bingbot receive the real content, including JSON-LD, without executing JS.
3. Humans are unaffected — byte-identical behaviour to today.

### Non-goals

Migrating to SSR; Bangla-scoped URLs; changing the share button; `www`→apex; comparison pages.
See §14.

---

## 2. Approach

**Chosen: a Go render path behind nginx user-agent routing.** nginx matches crawler
user-agents and proxies those requests to a new Go route that renders HTML from the database
with `html/template`. This extends a seam that already exists — `/sitemap.xml` on the public
domain is already proxied to the Go API, and [`sitemap.go`](../../../be/internal/handlers/sitemap.go)
is the pattern to follow.

**Rejected: self-hosted headless-Chrome prerenderer.** Its real advantage is zero drift —
bots see literally what React renders. But it puts a new long-running service in front of the
only distribution channel, with 2–6 s cold renders (862 KB bundle plus API round-trips)
against scrapers that give up in seconds, so it needs a cache layer to be trustworthy, and
when it silently breaks, unfurls silently break with it. Capacity is not the objection — the
VPS has 8 GB RAM, 4 CPUs and Node 22 — the fragility is. If content volume grows and drift
becomes real pain, this is a clean swap later: the nginx seam is identical.

**Rejected: build-time prerendering (vike).** The valuable pages are reviews and products
created continuously, which a build cannot cover.

The honest cost of the chosen approach is a second rendition of each page that can drift from
the React one. §9 is how that is contained.

---

## 3. The seam

The live nginx config is hand-maintained on the VPS at
`/etc/nginx/sites-available/reviewhub` (symlinked into `sites-enabled`), is SSL-terminated
with Cloudflare origin certs, and **does not match the copy in this repo**, which is still
HTTP-only. `deploy/deploy.sh` only runs `nginx -t && systemctl reload nginx` — it never
installs the config. So this change is applied by hand (§11).

Add at the top of the file (`map` requires `http` context; a `sites-enabled` file is included
inside `http`, so the top of that file is valid):

```nginx
map $http_user_agent $is_crawler {
    default 0;
    "~*facebookexternalhit|Facebot|WhatsApp|Twitterbot|LinkedInBot|TelegramBot|Slackbot|Discordbot|Googlebot|bingbot|Applebot|redditbot|Pinterest|SkypeUriPreview|embedly" 1;
}
```

Replace the `location /` block in the **`bdranks.com` 443 server block only** (not `cms.`,
not `api.`):

```nginx
location / {
    try_files $uri $uri/ @spa;        # real files still win
}

location @spa {
    if ($is_crawler) {
        proxy_pass       http://127.0.0.1:8080/_prerender$request_uri;
        proxy_set_header Host $host;
    }
    rewrite ^ /index.html break;      # humans: unchanged
}
```

`proxy_pass` inside `if` inside a **named** location is the documented-working case and is the
canonical recipe for this. `$request_uri` carries the original path and query string.

If the map never matches, behaviour is byte-identical to today — that is the rollback story.

Go registers one root-level route beside the sitemap, in
[`router.go`](../../../be/internal/router/router.go):

```go
prerenderH := handlers.NewPrerenderHandler(reviewRepo, productRepo, pageRepo, db, cfg.SiteURL)
r.Get("/_prerender/*", prerenderH.Serve)
```

---

## 4. File layout

| File | Responsibility |
|---|---|
| `be/internal/prerender/meta.go` | Pure: title rule, description formulas, absolute-URL helper. No DB, no HTTP. |
| `be/internal/prerender/jsonld.go` | Pure: builds the JSON-LD documents per page type. |
| `be/internal/prerender/page.go` | The `Page` view-model the template renders. |
| `be/internal/prerender/template.go` | The `html/template` document (one template, `{{block}}` per body type). |
| `be/internal/prerender/meta_test.go` | Table tests pinning every string to its `fe/` source. |
| `be/internal/prerender/jsonld_test.go` | JSON-LD shape + escaping tests. |
| `be/internal/handlers/prerender.go` | Route dispatch, data loading, status codes, headers. |
| `be/internal/handlers/prerender_test.go` | Handler tests incl. anonymity and 404 paths. |

Data comes from the **existing repositories** — no new SQL, so this shares the queries the API
already tests:

- `ReviewRepo.FindByID(ctx, id)` — already filters `WHERE r.id = ? AND r.is_approved = 1`,
  and already returns `Product`, `Timeline`, `Images` and the masked `Author`.
- `ProductRepo.FindByID(ctx, id)`
- `PageRepo.FindBySlug(ctx, slug)` — check `IsPublished` before rendering.
- `ReviewRepo.List(ctx, filter)` for the listing routes.
- The `/stats` query for the homepage counts (lift it into a small helper rather than
  duplicating the SQL).

---

## 5. Rendering contract

`cfg.SiteURL` is `https://bdranks.com` in production (confirmed in `be/.env.prod`) and
defaults to `http://localhost:5173`. Every canonical and image URL is built from it —
never from the request host.

### 5.1 Shared rules — mirror `PageHead` exactly

From [`PageHead.tsx`](../../../fe/src/components/PageHead.tsx):

```go
const SiteName = "BdRanks"

// PageHead.tsx: `title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}``
func FullTitle(title string) string {
    if strings.Contains(title, SiteName) {
        return title
    }
    return title + " | " + SiteName
}

// PageHead.tsx DEFAULT_DESC — used whenever a page passes no description.
const DefaultDesc = "Honest, time-tested product reviews from a real community. " +
    "Read reviews that track products over months and years."
```

Every page emits, in this order: `<title>`, `meta description`, `link canonical`,
`og:type`, `og:title`, `og:description`, `og:site_name`, `og:url`, `og:image`,
`twitter:card=summary_large_image`, `twitter:title`, `twitter:description`,
`twitter:image`, then one `<script type="application/ld+json">` per schema.

- `og:title` and `twitter:title` use the **full** title (with the suffix), matching `PageHead`.
- `og:url` and `canonical` are the same absolute URL: `SiteURL + path` — **path only, no query
  string**, which also fixes SEO report #4.
- `og:image` defaults to `SiteURL + "/og-image.png"`; a review's first image overrides it.
  Uploaded URLs are already absolute (`https://api.bdranks.com/uploads/…`), but pass every
  image through the absolutiser anyway.
- `<html lang="en">`. Chrome is English only; see §14 on Bangla.
- Clamp `description` to 200 characters on a word boundary with `…`. Review titles can be a
  full sentence (review 50 in production is 78 characters) — do **not** truncate the title,
  it is the real one.

### 5.2 Author attribution — get this right

Most content is imported: **21 of 23 production reviews come from Google**, owned by the
`import-bot@system.internal` account. Crediting `Author` would put the bot's name on someone
else's writing. Mirror [`reviewSource.ts`](../../../fe/src/lib/reviewSource.ts) exactly:

```go
// Mirrors reviewAuthorName() in fe/src/lib/reviewSource.ts.
// Order matters: anonymity wins over import attribution.
func AuthorName(r *models.Review) string {
    if r.IsAnonymous {
        return "Anonymous" // t("review.anonymous"), en
    }
    if r.Source != "" {
        if r.SourceAuthor != "" {
            return r.SourceAuthor
        }
    }
    if r.Author != nil {
        return r.Author.Username
    }
    return ""
}
```

When `Source != ""` the body must also render the credit line — `via Google`, linking to
`SourceURL` with `rel="nofollow noopener"` — the same honesty the SPA shows. Never render the
author badge for an imported review.

### 5.3 `/review/{id}`

| Field | Value |
|---|---|
| title | `review.Title` |
| description | `Excerpt` if non-empty, else `fmt.Sprintf("%s reviewed %s — rated %d/5.", authorName, review.Product.Name, review.Rating)` |
| og:type | `article` |
| og:image | `review.Images[0]` if any, else the default |
| canonical | `SiteURL + "/review/" + id` |

The dash in that formula is U+2014 EM DASH with a space either side. `FindByID` does not
populate `Excerpt`, so in practice the fallback is what renders — matching the SPA, where the
omitted JSON key makes `review.excerpt ?? …` take the fallback.

JSON-LD — two documents, mirroring `ReviewDetails.tsx`:

```json
[
  { "@context": "https://schema.org", "@type": "Review",
    "name": "<title>",
    "reviewRating": { "@type": "Rating", "ratingValue": "<rating>", "bestRating": "5", "worstRating": "1" },
    "author": { "@type": "Person", "name": "<authorName>" },
    "itemReviewed": { "@type": "Product", "name": "<product.name>", "url": "<SiteURL>/product/<product.id>" },
    "datePublished": "<created_at RFC3339>" },
  { "@context": "https://schema.org", "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "<SiteURL>" },
      { "@type": "ListItem", "position": 2, "name": "Browse Reviews", "item": "<SiteURL>/browse" },
      { "@type": "ListItem", "position": 3, "name": "<title>", "item": "<SiteURL>/review/<id>" } ] }
]
```

`ratingValue` is a **string**, `position` and `reviewCount` are **numbers** — as in the SPA.
Omit `description` when `Excerpt` is empty (the SPA omits the key rather than sending `null`).

Body: `<h1>` title · rating as text (`4 out of 5`) · author with the import credit when
applicable · link to the product page · the full `Content` in `<p>` blocks split on newlines ·
each timeline entry as `<article>` with its date, rating, title and content · each image as
`<img>` with `alt` and `loading="lazy"`. Do **not** render comments — they add drift for no
crawler value.

### 5.4 `/product/{id}`

| Field | Value |
|---|---|
| title | `product.Name + " Reviews"` |
| description | `fmt.Sprintf("Read %d honest review%s for %s. Average rating: %.1f/5.", n, plural, name, avg)` where `plural` is `"s"` unless `n == 1` |
| og:type | `article` |
| canonical | `SiteURL + "/product/" + id` |

JSON-LD: `Product` with `name`, `image` **only when `ImageURL` is non-empty**,
`aggregateRating { ratingValue: "%.1f", reviewCount: <int>, bestRating: "5", worstRating: "1" }`,
plus `BreadcrumbList` (Home → Categories → product name).

> **Deliberate deviation:** omit `aggregateRating` entirely when `ReviewCount == 0`. The SPA
> currently emits it unconditionally, which is invalid and risks a rich-result penalty (SEO
> report #11). Apply the same guard to
> [`ProductReviews.tsx`](../../../fe/src/pages/ProductReviews.tsx) in this change so the two
> sides stay identical — otherwise this is a knowing drift.

Body: `<h1>` product name · average and review count · the review list with author, rating and
excerpt, each linking to `/review/{id}`.

### 5.5 `/page/{slug}`

Title `page.Title`; description `page.MetaDescription` or the default; canonical
`SiteURL + "/page/" + slug`. JSON-LD: `Article { headline, description (only if set),
dateModified, publisher: Organization{name, url} }` plus `BreadcrumbList` (Home → title).
Render `Content`; 404 unless `IsPublished`.

### 5.6 Listing routes

| Path | Title | Description |
|---|---|---|
| `/` | `BdRanks - Honest Reviews Over Time` | `Discover honest, time-tested product reviews. Our community tracks products over months and years so you get the full picture before you buy.` |
| `/browse` | `Browse Reviews - BdRanks`, or `Search: "<q>" - BdRanks` when `?search=` | `Search and filter honest product reviews from our community. Find reviews by category, rating, and more.` |
| `/categories` | `Browse by Category - BdRanks`, or `<Label> Reviews - BdRanks` when `?type=` | `Browse product reviews by category — physical products, digital services, and more.`, or `Read honest <label> reviews from our community.` |

All three titles already contain `BdRanks`, so `FullTitle` appends nothing — preserve that.

Home JSON-LD is the `Organization` document from `Index.tsx`:
`{ "@type": "Organization", "name": "BdRanks", "url": "<SiteURL>", "description": "Honest, time-tested product reviews from a real community. Track how products perform over months and years." }`

Bodies: home renders the headline, the three live stats and the most recent reviews as links;
`/browse` and `/categories` render their listings as links. These pages exist to give crawlers
a path into the review pages.

### 5.7 Anything else

Public paths not listed above (e.g. `/rewards`) render a minimal document with
`<meta name="robots" content="noindex, nofollow">` and HTTP 200. Paths the SPA marks noindex
(`/auth`, `/profile`, `/write-review`, `/owner-*`, `/embed/*`) do the same. This is strictly
better than today's empty shell.

---

## 6. Status codes and headers

| Case | Status | Notes |
|---|---|---|
| Rendered page | 200 | |
| Review/product missing, unapproved, or page unpublished | **404** | Minimal `noindex` body. Fixes soft-404s (SEO report #10) for crawlers. |
| Malformed id (`/review/abc`) | 404 | |
| DB error | 500 | Log it; body is a minimal noindex document, never a stack trace. |

Every response:

```
Content-Type: text/html; charset=utf-8
Vary: User-Agent
Cache-Control: public, max-age=300
```

`Vary: User-Agent` is **required**: the same URL now returns different bodies depending on the
user-agent, and without it any intermediary cache could serve crawler HTML to a human.
Cloudflare currently reports `cf-cache-status: DYNAMIC` for HTML (verified), so it is not
caching these today, but the header must not depend on that staying true.

---

## 7. Correctness and security

1. **Anonymous reviews must never leak an author name.** `FindByID` already masks `Author`,
   and `AuthorUserID` is `json:"-"`. The renderer uses `AuthorName()` (§5.2) and must never
   touch `AuthorUserID`. This is a brand-new surface that bypasses the SPA's guard entirely,
   so it gets its own test.
2. **Only approved and published content.** `FindByID` enforces `is_approved = 1`; check
   `IsPublished` for pages explicitly.
3. **No `</script>` breakout in JSON-LD.** Build documents as Go structs and `json.Marshal`
   them. `json.Marshal` escapes `<`, `>` and `&` as `\u003c`, `\u003e` and `\u0026` by
   default, so a `</script>` inside review text cannot terminate the block. Inject the
   result through a dedicated `template.JS`-typed field; never `template.HTML` on user
   content.
4. **Everything else through `html/template`** auto-escaping. No `text/template` anywhere in
   this package.
5. **No user input in URLs unescaped** — `url.PathEscape` the slug when building canonicals.
6. **Read-only, unauthenticated.** No session handling, no writes, no view-count increment
   (a crawler fetch is not a human view).

---

## 8. Anti-drift strategy

Both sides render from the same data, so the risk is the *strings*. Contain it:

1. `meta_test.go` is a table test asserting every title and description byte-for-byte, with
   each case commented with the `fe/` file and line it mirrors — e.g.
   `// fe/src/components/PageHead.tsx:31 — fullTitle`. Editing one side reddens a test.
2. Keep every literal in `prerender/meta.go`. No strings in templates or handlers.
3. The one intentional divergence (§5.4, `aggregateRating`) is fixed on both sides in this
   change, so the steady state is zero known drift.
4. Add a line to `fe/CLAUDE.md` noting that `PageHead` strings are mirrored in
   `be/internal/prerender/meta.go` and both must change together.

---

## 9. The og-image

`fe/public/og-image.png` is **literally `logo.png` copied** — identical md5
(`cc32e4ab…`), 1536×1024, 2,140,773 bytes. Wrong aspect ratio for a social card and far too
large; Facebook and WhatsApp routinely skip preview images this size, which would leave the
unfurl text-only even after this work.

Generate a proper 1200×630 card. Pillow 10.2 is available locally, so no new dependency:

```python
# scripts/make-og-image.py — run once, commit the output
from PIL import Image
BG = (252, 250, 248)          # --background: 40 33% 98% in fe/src/index.css
card = Image.new("RGB", (1200, 630), BG)
logo = Image.open("fe/src/assets/logo-tight.png").convert("RGBA")
logo.thumbnail((520, 300), Image.LANCZOS)
card.paste(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2 - 40), logo)
# tagline: "Rank. Trust. Choose Better." centred below, brand ink colour
card.save("fe/public/og-image.png", optimize=True)
```

Target under 150 KB. Verify: `file` reports 1200×630, and `ls -l` confirms the size.

Out of scope, flagged: `logo.png` (2.1 MB) and `logo-tight.png` (578 KB) still load on every
page.

---

## 10. Testing

**Unit, no DB** — `prerender` package:
- Every title and description formula (§8.1), including the `FullTitle` no-double-suffix rule
  and the 200-char description clamp.
- `AuthorName`: anonymous wins over import; import prefers `SourceAuthor`; falls back to
  `Author.Username`; empty when neither exists.
- JSON-LD: exact shapes; `ratingValue` a string and `position` a number; `image` omitted when
  empty; `aggregateRating` omitted at zero reviews; `description` omitted when empty.
- Escaping: a review whose title and content contain `</script><script>alert(1)</script>`,
  `<`, `&`, quotes and a `javascript:` URL renders with no executable breakout in either the
  body or the JSON-LD.

**Handler, with throwaway MySQL** — reuse the `MYSQL_TEST_DSN` pattern from
[`feedback_integration_test.go`](../../../be/internal/repository/feedback_integration_test.go):
- `/review/{id}` for an approved review renders 200 with the expected tags.
- An **unapproved** review → 404.
- An **anonymous** review → body and JSON-LD contain `Anonymous` and **not** the username.
- An **imported** review credits `SourceAuthor`, not the bot, and includes the `via Google`
  link.
- A product with zero reviews → no `aggregateRating`.
- An unpublished page → 404; a published one → 200.
- `/review/abc` and a nonexistent id → 404.
- An unknown path → 200 with `noindex`.
- Every response carries `Vary: User-Agent`.

**Manual, after deploy** — §12.

---

## 11. Deploy runbook

Order matters. nginx first means crawlers get 502s.

1. **Ship the Go binary.** Merge and push `main`; `deploy.sh` builds and restarts
   `bdranks-api`. `/_prerender` is live but unreferenced, so nothing changes for anyone.
2. **Verify on the VPS before touching nginx:**
   ```bash
   ssh -i ~/.ssh/bdranks_deploy deploy@176.57.189.163 \
     'curl -s http://127.0.0.1:8080/_prerender/review/50 | head -20'
   ```
   Expect a full `<head>` with `og:` tags. If this 404s or 502s, stop.
3. **Apply nginx by hand** (it is not installed by `deploy.sh`):
   ```bash
   ssh -i ~/.ssh/bdranks_deploy deploy@176.57.189.163
   sudo cp /etc/nginx/sites-available/reviewhub{,.bak-$(date +%F)}
   sudo nano /etc/nginx/sites-available/reviewhub     # add the map + @spa block (§3)
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. **Rollback** is restoring the `.bak` file and reloading. The Go route can stay; it is inert
   without the nginx rule.

No migration. No new environment variables — `SITE_URL` is already set in `be/.env.prod`.

---

## 12. Verification checklist

```bash
# 1. A crawler gets real tags
curl -s -A "facebookexternalhit/1.1" https://bdranks.com/review/50 | grep -E 'og:|<title>'

# 2. A human still gets the SPA shell (must show the bundle script, no og: tags)
curl -s https://bdranks.com/review/50 | grep -cE 'og:|assets/index-'

# 3. Vary header present
curl -sI -A "Googlebot/2.1" https://bdranks.com/review/50 | grep -i '^vary'

# 4. Soft-404 is now a real 404
curl -s -o /dev/null -w '%{http_code}\n' -A "Googlebot/2.1" https://bdranks.com/review/999999

# 5. og-image is the right shape and size
curl -sI https://bdranks.com/og-image.png | grep -i content-length
```

Then: Facebook Sharing Debugger on a review URL (use *Scrape Again* — Facebook caches
aggressively), Google Rich Results Test on a review and a product URL, and share one link into
a real WhatsApp chat.

---

## 13. Residual risks

- `https://api.bdranks.com/_prerender/review/50` is publicly reachable and returns the same
  HTML. It is unlinked and its canonical points at `bdranks.com`, so the indexing risk is low;
  an nginx `deny`/`return 404` for `/_prerender` on the `api.` block closes it if wanted.
- The user-agent list needs occasional maintenance as scrapers change.
- Because crawler and human responses differ by user-agent, anyone debugging unfurls must
  remember to pass `-A`. Noted in §12.
- Rendering real content to search engines while humans get the same content via JS is not
  cloaking, but it stays true only while both sides render from the same data — which is
  exactly what §8 protects.

---

## 14. Out of scope

Excluded by explicit choice on 2026-09-12:

- `navigator.share()` on the share button (still clipboard-only).
- `301 www → apex` — `https://www.bdranks.com` still returns 200.
- Syncing the stale `deploy/nginx/reviewhub.conf` to match live.
- Compressing `logo.png` / `logo-tight.png`.

Deferred by design:

- **Bangla.** The chrome renders in English. The site has no `/bn/` URLs, so there is no
  language-scoped canonical to serve, and review bodies are already in whatever language the
  author wrote. When language-scoped URLs land (SEO report #12), this renderer gains a
  language argument and `hreflang` alternates — the cleanest point to revisit.
- Nesting `Review` inside `Product` via `itemReviewed` on review pages (SEO report #11) —
  mirror whatever the SPA does; changing both is a separate decision.
