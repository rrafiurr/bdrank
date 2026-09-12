# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server on port 8080 (falls back to 8081 if taken)
npm run build      # Production build
npm run build:dev  # Development build
npm run lint       # Run ESLint
npm run preview    # Preview production build locally
npm run test:rules # Unit-test the pure rule modules (no framework, no deps)
```

There is no component/browser test suite. `test:rules` runs the pure-logic tests
that do exist straight through Node's TypeScript support — currently
[src/lib/scrollTopRules.test.ts](src/lib/scrollTopRules.test.ts). Logic worth
testing belongs in a pure module in `src/lib/` with a sibling `*.test.ts`, which
keeps it verifiable without a DOM; add it to that script's path list.

`npm run lint` currently reports pre-existing errors across the repo (mostly
`no-explicit-any` and empty `catch` blocks) — when checking your own work, lint
the files you touched rather than reading the whole-repo exit code as a
regression.

Neither `npm run build` nor `npm run lint` type-checks. The real check is
`npx tsc --noEmit -p tsconfig.app.json`.

## Repository Context

`fe/` is the public web client of a three-part project:

| Directory | What it is |
|---|---|
| `fe/` | This app — React 18 + Vite + TypeScript SPA (bdranks.com) |
| `be/` | Go 1.22 API (`final-review/be`), MySQL, migrations in `be/migrations/` |
| `cms/` | Separate Vite admin SPA for managing products, categories, review fields, campaigns |

The backend is the source of truth for the data model. When you need the schema,
read `be/migrations/` — the latest is `016_feedback.sql`.

## Architecture

**Routing**: React Router v6, all routes defined in [src/App.tsx](src/App.tsx). Path alias `@/` maps to `src/`.

**Data fetching**: TanStack React Query throughout, against the Go API via
`apiFetch()` in [src/lib/api.ts](src/lib/api.ts). `apiFetch` attaches the bearer
token, sets `Content-Type` unless the body is `FormData`, and on 401 clears the
session and redirects to `/auth` — pass `{ redirectOn401: false }` for calls a
signed-out visitor makes on a public page, so a 401 surfaces as an ordinary error
instead of throwing them off the page. API shapes are exported as `Api*`
interfaces from the same file.

**Authentication**: `AuthProvider` wraps the app; consume via `useAuth()` from
[src/hooks/useAuth.tsx](src/hooks/useAuth.tsx). Real JWT auth against the backend —
email/password plus Google and Facebook OAuth. The session (`{ token, user }`) is
stored in `localStorage` under **`auth_session`**.

**i18n**: react-i18next, English and Bangla, configured in
[src/lib/i18n.ts](src/lib/i18n.ts). Strings live in
[src/locales/en/translation.json](src/locales/en/translation.json) and
[src/locales/bn/translation.json](src/locales/bn/translation.json) — **add every new
key to both**; they are currently at exact parity. Language is detected from
`localStorage.lang`, then the browser, and `<html lang>` is kept in sync.
Interpolation escaping is off because React escapes already. Note that `count` is
i18next's plural trigger: name an interpolation variable something else unless you
actually want `_one`/`_other` forms.

**UI**: shadcn/ui (Radix + Tailwind) in [src/components/ui/](src/components/ui/). Use
`cn()` from [src/lib/utils.ts](src/lib/utils.ts) for class merging. Design tokens
(including `shadow-elevated`, `shadow-soft`, `gradient-warm`) are CSS variables
defined in [src/index.css](src/index.css), with light and dark values.

**SEO**: every page renders `<PageHead>` ([src/components/PageHead.tsx](src/components/PageHead.tsx)),
which wraps react-helmet-async — title, description, canonical, OG tags, and
optional JSON-LD.

**Analytics**: GA4 page views on every client-side navigation via
[src/components/RouteAnalytics.tsx](src/components/RouteAnalytics.tsx), mounted inside
`<BrowserRouter>`. `/embed/*` is deliberately excluded — embed widgets run on
third-party sites and would distort bdranks.com's own metrics.

## Environment Variables

All optional; each feature degrades quietly when its variable is absent.

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend base URL (default `http://localhost:8080/api/v1`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth; absent means `GoogleOAuthProvider` is not mounted |
| `VITE_FACEBOOK_APP_ID` | Facebook login |
| `VITE_SOCIAL_LOGIN_ENABLED` | Master toggle for social sign-in |
| `VITE_GA_MEASUREMENT_ID` | GA4; absent disables analytics entirely |

## Routes

| Route | Page |
|---|---|
| `/` | `Index` (current home) |
| `/home-old` | `IndexLegacy` (previous home, kept for comparison) |
| `/browse` | `BrowseReviews` |
| `/product/:id` | `ProductReviews` |
| `/review/:id` | `ReviewDetails` |
| `/review/:id/add-timeline` | `AddTimeline` |
| `/write-review` | `WriteReview` |
| `/categories` | `Categories` |
| `/auth` | `Auth` |
| `/profile` | `Profile` |
| `/rewards` | `Rewards` (+ `pages/rewards/LeaderboardTab`) |
| `/feedback` | `Feedback` — send feedback (signed-in; history and admin replies show on `/profile`) |
| `/page/:slug` | `StaticPage` (CMS-authored content) |
| `/owner-register`, `/owner-dashboard`, `/owner-qr`, `/owner-embed` | Product-owner flows |
| `/embed/:token` | `EmbedPage` — bare badge widget for third-party iframes, no Header/Footer |
| `*` | `NotFound` |

## Domain Notes

**Categories** are `physical`, `digital`, `service` and `food`. They are fetched from
`/categories`, not hardcoded — but [src/lib/categoryDisplay.ts](src/lib/categoryDisplay.ts)
maps those four slugs to icons and colours, with a neutral fallback for anything new.

**Custom review fields**: admins define extra per-category or per-product inputs
(text/url/select/number) in the CMS; the form fetches them from `/review-fields` and
renders them via [src/components/CustomFieldInputs.tsx](src/components/CustomFieldInputs.tsx).
The server re-resolves and re-validates on submit, so nothing client-side is a
security boundary.

**Timelines**: a review can accumulate entries over time via `/review/:id/add-timeline`.
Reviews that hold up over months are the product's whole premise — keep that in mind
when writing reviewer-facing copy.

**Reviews are real**: `ReviewForm` POSTs multipart `FormData` to `/reviews` (images,
video link, custom field answers, anonymous flag). It is not a stub.

## The Review Form

[src/components/ReviewForm.tsx](src/components/ReviewForm.tsx) is the most intricate
screen in the app. It is organised as four numbered sections — subject, rating,
experience, optional proof — and splits into:

- [ProductPicker.tsx](src/components/ProductPicker.tsx) — autocomplete over existing
  products. Typing a name that matches nothing is valid; the review then creates a
  new product, which is why the field never forces a selection.
- [ReviewPrompts.tsx](src/components/ReviewPrompts.tsx) + [src/lib/reviewPrompts.ts](src/lib/reviewPrompts.ts) —
  chips that insert section headings into the body so reviewers aren't facing a blank
  box. "Used" state is derived from the body text, never tracked separately, so it
  survives a draft restore or a hand-deleted heading.
- [useReviewDraft.ts](src/hooks/useReviewDraft.ts) — debounced autosave to
  `review_draft_${userId}`, 7-day expiry. It stores the selected product **whole**,
  not just its name: restoring by name alone would silently create a duplicate
  product on submit.

Validation is inline and per-field (`aria-invalid` + `aria-describedby`), and submit
scrolls to and focuses the first error in DOM order. Toasts are reserved for genuine
network failures. Two ordering decisions are deliberate: the rating comes before the
body because it is a one-tap commitment that primes the writing, and the title comes
*after* the body because you cannot summarise what you have not yet written.

## Key Notes

- `bun.lockb` exists alongside `package-lock.json`; prefer `npm`.
- [src/lib/staticData.ts](src/lib/staticData.ts) is **dead code** — a leftover from the
  pre-API prototype with no remaining importers. Do not add to it; do not treat it as
  a data source.
- `BrowseReviews` once held its own hardcoded array; it now reads from the API like
  everything else.
- A global [ScrollToTop.tsx](src/components/ScrollToTop.tsx) is mounted once in
  `App.tsx` for all routes (excluded on `/embed/*`). Whether it is *visible* is
  decided by [src/lib/scrollTopRules.ts](src/lib/scrollTopRules.ts): the
  threshold scales with how far the page can actually scroll, because a flat
  `scrollY > 400` is unreachable on any page shorter than one viewport plus
  400px and left the button missing from every short route.
- The production bundle is over 500 kB and Vite warns about it on every build. That
  warning is pre-existing, not a regression from your change.
