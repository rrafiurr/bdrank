# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server on port 8080
npm run build      # Production build
npm run build:dev  # Development build
npm run lint       # Run ESLint
npm run preview    # Preview production build locally
```

There is no test suite configured.

## Architecture

React 18 SPA with Vite and TypeScript. **Supabase has been removed** — the app currently uses only static data and localStorage for persistence.

**Routing**: React Router v6, all routes defined in [src/App.tsx](src/App.tsx). Path alias `@/` maps to `src/`.

**Data fetching**: TanStack React Query is wired up (`QueryClient` in [src/App.tsx](src/App.tsx)) but not actively used. All read data currently comes from [src/lib/staticData.ts](src/lib/staticData.ts) (products + reviews) or inline arrays within individual page files.

**Authentication**: `AuthProvider` wraps the entire app; consume via `useAuth()` from [src/hooks/useAuth.tsx](src/hooks/useAuth.tsx). This is a **mock auth** — any email/password is accepted, the session is stored in `localStorage` under the key `auth_user`, and user IDs are derived deterministically from `btoa(email)`. There is no real backend verification.

**Profile persistence**: Profile data (username, bio, avatar URL) is stored in `localStorage` under `user_profile_${userId}`. No server involved.

**UI**: shadcn/ui components (Radix UI + Tailwind CSS) in [src/components/ui/](src/components/ui/). Use the `cn()` utility from [src/lib/utils.ts](src/lib/utils.ts) for Tailwind class merging. Forms use React Hook Form + Zod.

## Data Layer

Static data lives in [src/lib/staticData.ts](src/lib/staticData.ts):
- `staticProducts`: 8 sample products with `id`, `name`, `category`, `image_url`, `created_at`
- `staticReviews`: 11 sample reviews with `id`, `product_id`, `title`, `content`, `rating`, `likes_count`, `comments_count`, `images[]`, `author`

Pages that consume `staticData`: `ProductReviews`, `ReviewedProducts`, `ReviewedProductsGrid`.

`BrowseReviews` has its **own separate inline hardcoded array** — it does not share data with `staticData.ts`.

`ReviewForm` submission is a stub (`TODO` comment + artificial delay); reviews are not actually persisted anywhere.

## Pages and Status

| Route | Page | Data source |
|---|---|---|
| `/` | `Index` | Static/components |
| `/browse` | `BrowseReviews` | Inline hardcoded array |
| `/product/:id` | `ProductReviews` | `staticData.ts` |
| `/review/:id` | `ReviewDetails` | — |
| `/review/:id/add-timeline` | `AddTimeline` | — |
| `/write-review` | `WriteReview` | Form stub, no persistence |
| `/categories` | `Categories` | — |
| `/auth` | `Auth` | Mock localStorage auth |
| `/profile` | `Profile` | localStorage |

## Database Schema (reference only — not currently connected)

The intended schema for a future backend:
- **reviews**: `id`, `title`, `content`, `rating`, `product_id`, `user_id`, `images[]`, `likes_count`, `comments_count`, timestamps
- **products**: `id`, `name`, `category`, `image_url`, `created_by`, timestamps
- **profiles**: `id`, `username`, `avatar_url`, `bio`, timestamps

The three product categories are: `physical`, `digital`, `service`.

Reviews support a **timeline feature** — a single review can have multiple timeline entries added over time via `/review/:id/add-timeline`.

## Key Notes

- `bun.lockb` exists alongside `package-lock.json`; prefer `npm`.
- There is no `.env` file required — Supabase env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are no longer used.
