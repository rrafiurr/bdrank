# Embeddable Review Badge — Design Spec

**Date:** 2026-06-27
**Status:** Approved

## Goal
Product owners can embed a BdRanks review badge on their own website. The badge shows live review data (avg rating, count, breakdown, latest snippet). Each badge is product-specific, domain-locked, and requires admin approval before it goes live.

## Architecture

### Data model
One table: `embed_tokens`. One row = one product × one domain. An owner with two domains for the same product creates two rows.

| Column | Notes |
|---|---|
| `token` VARCHAR(64) UNIQUE | random 48-char hex, the "embed key" |
| `product_id`, `owner_id` | FK → products, users |
| `domain` VARCHAR(255) | stored as bare hostname, e.g. `mybrand.com` |
| `status` ENUM('pending','approved','revoked') | default `pending` |
| `show_rating/count/breakdown/snippet` TINYINT | owner-chosen display options |
| `admin_note` VARCHAR(500) | optional note shown to owner |
| `approved_at` TIMESTAMP NULL | set when status → approved |

### Anti-abuse strategy
- **Admin approval gate:** badge returns 403 `not_approved` until admin approves
- **Domain allowlist:** widget API checks `Origin` / `Referer` header against registered domain; mismatch → 403 `domain_mismatch` (badge renders in a "Not authorized for this domain" error state — visually obvious to the site's visitors)
- **Trust seal always visible:** badge always links back to BdRanks with the real product name — pirating someone else's code shows their product's reviews, which doesn't benefit the pirate
- **Missing Origin/Referer:** allowed (enables curl testing by admins)

### Embed formats
Both served from BdRanks; owner picks one or both:

- **Script tag** (`/widget.js`): vanilla JS static file; self-discovers its own origin from `document.currentScript.src`; works on any website
- **iframe** (`/embed/:token`): FE React route; renders badge without header/footer; sandboxed from host site styles

## Flows

### Owner flow
1. Owner opens "Embed Codes" tab in `/owner-dashboard` → link to `/owner-embed`
2. Selects product, enters domain, toggles display options, submits
3. Status shows "Pending" → admin approves → status shows "Approved"
4. Two copy buttons appear: Script tag / iframe

### Admin flow
1. New "Embeds" page in CMS sidebar (with pending count badge)
2. Filter by status (default: Pending)
3. Approve or Revoke with optional note

### Widget request flow
```
External browser GET /api/v1/widget/TOKEN
  → check token exists (404 if not)
  → check status == "approved" (403 not_approved)
  → extract hostname from Origin/Referer
  → compare to registered domain (403 domain_mismatch if mismatch)
  → query product summary, return JSON
  CORS: Access-Control-Allow-Origin: * (only this endpoint)
```

## Widget API response
```json
{
  "product": { "id": 5, "name": "AquaGel Sunscreen", "url": "https://bdranks.com/product/5" },
  "avg_rating": 4.3,
  "review_count": 128,
  "breakdown": { "1": 2, "2": 3, "3": 10, "4": 25, "5": 60 },
  "latest_review": { "title": "Still great after 6 months", "rating": 5, "date": "2026-05" },
  "config": { "show_rating": true, "show_count": true, "show_breakdown": false, "show_snippet": true }
}
```

## Badge visual
Compact card; always shows BdRanks logo + product name link. Owner toggles show/hide for rating, count, breakdown, snippet. Error state (not_approved / domain_mismatch) shows grey "Not authorized · bdranks.com".

## CORS strategy
Widget endpoint needs `Access-Control-Allow-Origin: *`. The existing global `buildCORSMiddleware` is modified to detect `/api/v1/widget/` paths and use wildcard CORS + allow OPTIONS preflight for those paths only.
