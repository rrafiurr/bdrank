# Rewards leaderboard design

**Date:** 2026-07-25
**Status:** Approved

## Goal

Add a leaderboard to the reward system so signed-in users can see the top-ranked
users and browse the full ranked list across several timeframes, with their own
rank always visible. Built the way modern leaderboards work: multiple
timeframes, strict ranking with deterministic tie-breaks, pagination, and a
pinned "your rank" row.

## Product decisions

- **Timeframes:** All-time, This month, This week, Today.
- **Visibility:** Logged-in only (auth-guarded). Anonymous visitors do not see
  the board.
- **Your rank:** The current user's row is highlighted inline; if they fall
  outside the loaded page, a pinned sticky row shows their rank. A user with 0
  points in the selected window is shown as *unranked*.

## Ranking metric per timeframe

- **All-time** → `reward_balances.lifetime_points` (total ever earned;
  redemptions decrement `points` but never `lifetime_points`, so this is a pure
  "earned" metric).
- **Month / Week / Today** → `SUM(points)` over `reward_transactions` where
  `points > 0` (excludes redemption debits, which are negative rows) and
  `created_at >= <window start>`, grouped by `user_id`.

All window boundaries are computed in **UTC**, consistent with the existing
UTC-pinned DB session (commit 84f0590):

- **Today:** `created_at >= UTC_DATE()` (since 00:00 UTC today).
- **This week:** since Monday 00:00 UTC of the current ISO week.
- **This month:** since the 1st of the current month, 00:00 UTC.

Window starts are computed in Go and passed as parameters (not with DB-local
date functions), so the boundary logic is unit-testable and tz-stable.

### Ordering and ties

- Order by metric DESC, then `user_id` ASC (deterministic tie-break).
- Positions are strict and sequential (1, 2, 3, …) — `ROW_NUMBER()`-style, not
  shared ranks.
- Users with a 0 metric in the selected window are excluded from the board.

## Compute approach

**Chosen: (A) live SQL with MySQL 8 window functions.** Each request runs:

1. A page query: rank the metric, `ORDER BY metric DESC, user_id ASC`, apply
   `LIMIT/OFFSET`, join `users` for name/avatar.
2. A cheap "your rank" query: `COUNT(*) + 1` of users who rank ahead of the
   caller under the *same* ordering — i.e. `metric > mine OR (metric = mine AND
   user_id < mine)` — so the pinned rank always matches the caller's strict
   in-page position on ties. Avoids a full ranked scan.

Rationale: rewards is already pure MySQL, this adds no new infrastructure, is
correct, and is instant at the current scale. Levels are resolved in batch via
the existing `Service.LevelsForUsers(userIDs)`.

**Indexes (migration `010_leaderboard.sql`):**

- `reward_transactions (created_at, user_id, points)` — supports the windowed
  `WHERE created_at >= ? GROUP BY user_id SUM(points)` boards (the existing
  `idx_reward_tx_user_time` leads with `user_id`, which does not serve a global
  window scan).
- `reward_balances (lifetime_points)` — supports the all-time ordering.

**Documented upgrade path (not built now):**

- **(B) Redis sorted set (ZSET):** `ZADD` on every Award, `ZREVRANK` for
  O(log n) rank — how large realtime boards run. Needs dual-writes, backfill,
  and rotating per-window keys. Adopt when the user base makes live aggregation
  costly.
- **(C) Snapshot table via cron:** periodically materialize ranks; a
  middle-ground for medium scale.

The API contract below is identical regardless of approach, so a later swap to
B or C does not touch the frontend.

## API

Auth-guarded (mounted in the JWT-protected group, alongside `/rewards/me`):

```
GET /api/v1/rewards/leaderboard?timeframe=all|month|week|today&limit=50&offset=0
```

- `timeframe` defaults to `all`; unknown values → 400.
- `limit` clamped to a sane max (e.g. 100), default 50; `offset` >= 0.

Response:

```json
{
  "timeframe": "all",
  "total": 128,
  "entries": [
    { "rank": 1, "user_id": 7, "username": "alice",
      "avatar_url": "https://…", "level": { "name": "Gold", "icon": "…", "color": "#…" },
      "points": 1240, "is_me": false }
  ],
  "me": { "rank": 27, "points": 120, "unranked": false }
}
```

- `entries[].level` may be null when no level matches (levels table can be
  empty). `is_me` flags the current user's row within the page.
- `me` is always present for the authenticated caller; `unranked: true` with
  `rank: 0` when the user has 0 points in the window.

## Backend structure

Follow existing rewards layering:

- **`repo.go`**: `LeaderboardPage(ctx, metric, start, limit, offset)` returning
  ranked rows + total, and `UserRank(ctx, metric, start, userID)` returning the
  user's rank and points. A `metric`/timeframe enum selects the all-time column
  path vs. the windowed-sum path.
- **`service.go`**: `Leaderboard(ctx, timeframe, userID, limit, offset)` —
  resolves the window start (Go), calls the repo, batch-loads levels via
  `LevelsForUsers`, assembles the view including `me`.
- **`handlers.go` / `routes.go`**: parse/validate query params, call the
  service, write JSON. New route registered in the auth group in
  `routes.go`.
- **`models.go`**: `LeaderboardEntry`, `LeaderboardView`, `LeaderboardMe`.
- Timeframe → window-start helper lives in a small pure function for testing.

## Frontend

New **Leaderboard tab** on the Rewards page ([Rewards.tsx](../../../fe/src/pages/Rewards.tsx)),
alongside the existing tabs.

- **Timeframe control:** segmented buttons — All-time / Month / Week / Today.
- **Rows:** rank number (medal styling for top 3), `UserAvatar`
  (name + avatar_url), username, `LevelBadge`, points. The current user's row
  is highlighted.
- **Your rank:** when the user is outside the loaded rows, a pinned sticky row
  at the bottom shows their rank/points; `unranked` renders a friendly
  "Earn points to join the board" state.
- **Pagination:** "Load more" using `offset`, until `entries.length === total`.
- **States:** loading skeletons, empty board ("No one's on the board yet"),
  and query error/retry consistent with the existing rewards tabs.
- **API:** add `rewardsApi.leaderboard(token, timeframe, limit, offset)` in
  [rewardsApi.ts](../../../fe/src/lib/rewardsApi.ts) with matching TypeScript
  types.
- **i18n:** new keys under a `leaderboard` namespace in the en and bn locale
  files.

## Edge cases

- Empty board (no one has points) → empty state, `me.unranked = true`.
- Levels table empty → `level: null`, UI omits the badge.
- Ties → deterministic order via `user_id` tie-break; strict sequential ranks.
- Deleted user → excluded naturally (balances/transactions cascade on user
  delete).
- `offset` beyond `total` → empty `entries`, still returns `me`.

## Testing

Go unit tests in `be/internal/rewards/` mirroring the existing `*_test.go`
style:

- Window-start computation for today/week/month (including boundary and
  Monday-start week).
- Ranking/tie-break ordering and strict sequential positions.
- Your-rank via count, including the outside-page and unranked (0 points)
  cases.
- Exclusion of 0-metric users and of negative (redemption) transactions from
  windowed sums.

Frontend has no test suite; verify with `npm run lint`, `npm run build`, and
running the app (each timeframe, load-more, highlighted and pinned your-rank).
