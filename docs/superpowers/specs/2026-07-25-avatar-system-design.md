# Consistent avatar system design

**Date:** 2026-07-25
**Status:** Approved

## Problem

There is no real avatar upload today — the Profile page only offers a
"paste an image URL" text field ([Profile.tsx](../../../fe/src/pages/Profile.tsx));
the camera hover-overlay is decorative. Fallback initials are rendered
inconsistently across ~9 sites: some use one letter, some two; some username,
some email; each site picks its own colors. We want a modern, consistent
avatar everywhere: upload + square crop for the user's own photo, and a
nicely generated letter-avatar when there is no photo.

## Decisions (from brainstorming)

- **Crop:** interactive cropper (drag + zoom, 1:1 frame) via `react-easy-crop`.
- **Letter source:** first letter of the display name — username when present,
  email's first letter only as fallback. Other users (review authors,
  commenters) expose only `username` to the client, never email, so username
  is the primary source everywhere.
- **Color:** deterministic per user — hash the name into a fixed palette so a
  user always gets the same color.
- **Letter-avatar is rendered, never stored:** `avatar_url` stays empty for
  users without an uploaded photo.

## Component: `<UserAvatar>`

New shared component (`fe/src/components/UserAvatar.tsx`) wrapping the existing
Radix `Avatar` primitives. Replaces every ad-hoc
`<Avatar>/<AvatarImage>/<AvatarFallback>` block.

- **Props:**
  - `name: string` — display name used for the initial and color hash.
  - `src?: string | null` — avatar image URL; empty/null → letter fallback.
  - `size?: "xs" | "sm" | "md" | "lg" | "xl"` — maps to the sizes already in
    use (xs=32px/`w-8`, sm=40px/`w-10`, md=48px/`w-12`, lg=64px, xl=96px/`w-24`).
    Each size also sets a matching letter font size.
  - `className?: string` — passthrough for rings/borders (e.g. Profile's
    `border-4`, comment `ring-2`).
- **Behavior:**
  - Non-empty `src` → `AvatarImage`; on load error Radix shows the fallback.
  - Fallback → first letter of `name`, uppercased, on a deterministic
    background from the palette; readable foreground per swatch.
- **Initial helper:** `initialOf(name)` returns the first alphanumeric
  character uppercased, or `"?"` when name is empty.
- **Color helper:** `colorFor(name)` — small deterministic string hash mod
  palette length. Palette (~8 entries) defined once in this file; each entry
  is a `{ bg, fg }` Tailwind class pair with sufficient contrast in light and
  dark.

## Crop flow (Profile page)

Replace the manual avatar-URL `<Input>` with an upload action; the existing
camera hover-overlay on the avatar becomes the clickable trigger for a hidden
`<input type="file" accept="image/*">`.

1. File selected → validate type is `image/*` and size ≤ 5 MB; otherwise toast
   an error and stop.
2. Open a modal containing `react-easy-crop` with `aspect={1}`, drag to pan,
   a zoom slider.
3. On **Save (crop)**: draw the selected crop region to a canvas at 400×400,
   export a JPEG blob (quality ~0.9).
4. `POST` the blob as multipart to the existing auth-guarded
   `/api/v1/upload/image`; response `{ url }` is written to the `avatarUrl`
   React state (and shown immediately in the avatar preview).
5. Persistence is unchanged: `avatar_url` is sent in the existing
   **Save Changes** PUT `/profile` alongside username/bio.

Cancelling the modal discards the selection and leaves the current avatar.

## Backend

No changes. Reuses:
- `POST /api/v1/upload/image` ([handlers/upload.go](../../../be/internal/handlers/upload.go)) — returns `{ url }`.
- `avatar_url` on the user record and `PUT /profile`
  ([handlers/profile.go](../../../be/internal/handlers/profile.go)).

## Render sites to migrate to `<UserAvatar>`

- [Header.tsx](../../../fe/src/components/Header.tsx) — user menu (sm).
- [ReviewCard.tsx](../../../fe/src/components/ReviewCard.tsx) — author (xs).
- [ReviewDetails.tsx](../../../fe/src/pages/ReviewDetails.tsx) — review author
  (md), comment-form current user (sm), two comment lists (sm; keep the
  `ring-2 ring-primary/30` via className on the highlighted one).
- [Profile.tsx](../../../fe/src/pages/Profile.tsx) — profile header (xl, keep
  `border-4 border-primary/20`).
- [ProductReviews.tsx](../../../fe/src/pages/ProductReviews.tsx),
  [Categories.tsx](../../../fe/src/pages/Categories.tsx),
  [BrowseReviews.tsx](../../../fe/src/pages/BrowseReviews.tsx) — any author
  avatars present.

Each call passes `name` (username, or the logged-in user's email when no
username) and `src={avatar_url}`.

## Trade-offs accepted

- One new dependency: `react-easy-crop` (small, widely used).
- The manual avatar-URL field is removed in favor of upload + crop; pasting an
  external URL is no longer supported.

## Verification

No FE test suite exists. Verify with `npm run lint`, `npm run build`, and
running the app: exercise the Profile upload → crop → save flow, and confirm
letter-avatars render with consistent per-user color across Header, review
cards, review detail, and comments (users with and without an uploaded photo).
