# Campaign banners on the profile — design

**Date:** 2026-07-25
**Status:** Approved

## Goal

When an admin runs a reward campaign, present it to users as a banner on their
profile page — one banner per currently-running campaign, stacked, always
visible while the campaign is active. Creating/activating a campaign in the CMS
is the only admin action needed; banners appear automatically.

## Scope

Frontend only. No backend, API, or migration changes — the existing
`GET /rewards/campaigns` endpoint and `rewardsApi.campaigns(token)` already
return everything needed.

## Data source

`rewardsApi.campaigns(token)` returns `CampaignView[]`, each with:
`id, name, description, image_url, starts_at, ends_at, goals[], my_points,
achieved_goal_ids (number[] | null), redeemed_goal_id, my_status`.

**Filter to currently-running campaigns:** keep only those where now is within
`[starts_at, ends_at]` (compared as timestamps). This excludes recently-ended
campaigns the endpoint also returns. `my_status` is not used for filtering
(a redeemed-but-still-running campaign still banners).

## Components

### `CampaignBanner.tsx` (presentational)

Props: a single `CampaignView`.

- **Background:** the campaign `image_url` with a dark gradient overlay for
  text legibility. When `image_url` is empty, fall back to the theme's
  `bg-gradient-warm`.
- **Content:** campaign `name` (serif heading) and `description` (line-clamped
  to ~2 lines).
- **Progress row:** the next unreached goal is the lowest-`threshold_points`
  goal whose `id` is not in `achieved_goal_ids`. Render
  `"{my_points} / {threshold} pts"` with a `Progress` bar filled to
  `my_points / threshold`. If all goals are reached (or
  `achieved_goal_ids` covers every goal), render an "All goals reached"
  message instead. If the campaign has no goals, omit the progress row.
- **CTA:** a "View" button linking to `/rewards`.

Pure and null-safe: `achieved_goal_ids` may be `null` (treat as empty); goals
may be empty.

### `ProfileCampaignBanners.tsx` (container)

- Runs the `campaigns` query (React Query, `enabled: !!token`), keyed
  `["rewards-campaigns"]` (shared with the Campaigns tab so it dedupes).
- Filters to currently-running campaigns and maps each to `<CampaignBanner>`.
- Renders **nothing** when: still loading, query errored, or no running
  campaigns (banners are non-critical — no skeleton, no empty state, no error
  UI).

## Placement

Rendered at the **top of the Profile page main content**, directly under the
`<Header>` and above the "My Profile" heading/edit card, inside the existing
`container` wrapper, so banners are the first thing a signed-in user sees.
Only shown to authenticated users (Profile is already auth-gated).

## i18n

The Profile page is internationalized, so banner copy uses translation keys
under a new top-level `campaignBanner` namespace in both `en` and `bn` locale
files: `view`, `progress` (`"{{points}} / {{threshold}} pts"`), and
`allGoalsReached`.

## Edge cases

- No running campaigns → section renders nothing.
- `image_url` empty → gradient fallback.
- `achieved_goal_ids` null / no goals → progress row omitted or "all reached"
  handled without error.
- `my_points` exceeding the next threshold shouldn't visually overflow — clamp
  the bar value to 100%.

## Trade-offs

- The "View" CTA lands on `/rewards`, which opens on the Catalog tab (no
  tab-in-URL support today), so reaching the Campaigns tab is one extra click.
  Deep-linking to the Campaigns tab is out of scope for this spec.
- Banners appear on the profile only, per the request; adding them elsewhere
  (e.g. home) is a later, easy extension.

## Testing

No FE test suite. Verify with `npm run lint`, `npm run build`, and a screenshot
of the profile with an active seeded campaign (image present and absent; a
campaign with goals showing progress, and one with all goals reached).
