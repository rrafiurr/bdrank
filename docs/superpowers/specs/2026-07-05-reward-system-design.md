# Reward System — Design Spec

**Date:** 2026-07-05
**Status:** Approved by user (brainstorming session)

## Goal

End users earn reward points for interactions (reviews, comments, daily login, profile completion — extensible to future events like shares). Point amounts, caps, levels, and the redemption catalog are all configured by the super admin. The backend is built as a **self-contained, portable sub-module** (`be/internal/rewards`) that can be copied into other projects.

Scope: backend module + CMS (admin) UI + FE (end-user) UI.

## Architecture decision

**Chosen: self-contained Go package `be/internal/rewards`** (over a separate go.mod module or an async event-worker design). The package owns its models, repository, service, HTTP handlers, and migration. Portability = copy the package + one migration file into another project, then add `Award()` calls at interaction points.

Host-app coupling is limited to:
- a `*sql.DB` handle
- user IDs (`int64`)
- auth/admin middleware passed into `RegisterRoutes`

## Data model (migration `009_rewards.sql`, all tables prefixed `reward_`)

### reward_rules
One row per earnable event type. This is where the super admin "declares" point amounts.

| column | type | notes |
|---|---|---|
| id | bigint PK | |
| event_type | varchar, unique | free string: `review_created`, `comment_created`, `daily_login`, `profile_completed`; future rows (e.g. `review_shared`) can be added by admin without schema changes |
| points | int | points awarded per event |
| daily_cap | int NULL | max awards per user per day; NULL = unlimited |
| lifetime_cap | int NULL | max awards per user ever; NULL = unlimited; `1` for `profile_completed` |
| is_active | bool | |
| updated_at | timestamp | |

Seeded with the four launch event types (suggested defaults: review 10, comment 2 with daily_cap 10, daily_login 1 with daily_cap 1, profile_completed 5 with lifetime_cap 1 — admin can change all of these).

### reward_transactions
Append-only ledger. Positive points = earned, negative = spent/refund-reversal.

`id, user_id, event_type, points, ref_type, ref_id, note, created_at`
Index on `(user_id, event_type, created_at)` for cap checks and history.

Spend entries use `event_type = 'redemption_spend'`, refunds use `'redemption_refund'` (both with `ref_type = 'redemption'`, `ref_id` = redemption id); these are ledger-only types and never appear in `reward_rules`.

### reward_balances
`user_id PK, points (spendable), lifetime_points (never decreases), updated_at`
Maintained atomically with each ledger insert. **Levels are computed from `lifetime_points`** so spending points never demotes a user's badge.

### reward_levels
Admin-defined tiers: `id, name, min_points, icon, color, is_active`.
A user's level = the highest active level with `min_points <= lifetime_points`. No level rows or lifetime below the lowest threshold → no badge.

### reward_items
Redemption catalog: `id, name, description, image_url, points_cost, fulfillment_type ('coupon'|'manual'), stock (NULL = unlimited), is_active, created_at`.
For coupon items, effective stock = count of unused codes.

### reward_coupon_codes
`id, item_id, code, redemption_id NULL, created_at`. A code is claimed by setting `redemption_id` inside the redemption transaction.

### reward_redemptions
`id, user_id, item_id, item_name (denormalized), points_spent, status, coupon_code, admin_note, created_at, resolved_at`

Status flow:
- **coupon item:** points deducted + code claimed + status `fulfilled`, all in one transaction; code returned in the response
- **manual item:** points deducted, status `pending` → admin sets `approved` (fulfilled outside the system) or `rejected` (points refunded via a reversing ledger entry, `event_type = 'redemption_refund'`)

## Module surface (what a host app touches)

```go
// Awarding — called at interaction points. Loads the rule; if the
// event type is unknown/inactive or a daily/lifetime cap is reached,
// it is a silent no-op. Errors are returned for logging but callers
// treat awarding as fire-and-forget: it must never fail the host action.
svc.Award(ctx, userID, "review_created", "review", reviewID)

// Route mounting — one call in router.go:
rewards.RegisterRoutes(mux, svc, authMiddleware, adminMiddleware)

// Badge decoration helper for host list endpoints:
svc.LevelsForUsers(ctx, userIDs) (map[int64]Level, error)
```

### Integration points in this project (4 one-line calls)
1. `handlers/reviews.go` — after review creation: `review_created`
2. `handlers/comments.go` — after comment creation: `comment_created`
3. `handlers/auth.go` — after successful login (incl. social): `daily_login` (daily_cap 1 dedupes)
4. `handlers/profile.go` — after profile update, when full_name + bio + avatar are all set: `profile_completed` (lifetime_cap 1 dedupes)

Plus: review and comment **list** responses gain an `author_badge` field (`{name, icon, color}` or null) populated via `LevelsForUsers` in the handlers — no rewards SQL inside review/comment repositories.

### Concurrency
Balance updates and coupon-code claiming run inside DB transactions with `SELECT ... FOR UPDATE` row locks — no double-spend, no double-claimed codes, correct under concurrent redemptions.

## HTTP API

### User (JWT auth)
| method & path | purpose |
|---|---|
| GET `/api/rewards/me` | balance, lifetime points, current level, next level + points needed |
| GET `/api/rewards/me/transactions` | paginated points history |
| GET `/api/rewards/levels` | active levels list (public-safe) |
| GET `/api/rewards/items` | active catalog; includes per-item `can_afford` and effective stock |
| POST `/api/rewards/redeem` | body `{item_id}`; coupon → returns code, manual → creates pending request |
| GET `/api/rewards/me/redemptions` | my redemption requests + statuses |

### Admin (admin middleware)
| method & path | purpose |
|---|---|
| GET `/api/admin/rewards/rules` / POST / PUT `/{id}` | list, add event type, edit points/caps/active |
| GET/POST/PUT/DELETE `/api/admin/rewards/levels[/{id}]` | manage tiers |
| GET/POST/PUT/DELETE `/api/admin/rewards/items[/{id}]` | manage catalog |
| POST `/api/admin/rewards/items/{id}/codes` | bulk-add coupon codes (newline-separated paste) |
| GET `/api/admin/rewards/redemptions?status=` | redemption queue/history |
| PUT `/api/admin/rewards/redemptions/{id}` | `{status: approved|rejected, admin_note}`; reject refunds points |

### Error handling
- Redeem: 400 with specific messages — insufficient points, item inactive, out of stock/no codes left
- `Award()` failures: logged by callers, never surfaced to the end user, never abort the host action
- Admin rule validation: points ≥ 0, caps ≥ 1 or null, event_type non-empty slug

## CMS (admin) UI

New sidebar section **Rewards** with four tabs (existing shadcn table/dialog/toast patterns, TanStack Query):
1. **Rules** — table of event types; edit points, daily cap, lifetime cap, active switch; "Add event type" dialog
2. **Levels** — tier list; name, min points, icon, color
3. **Catalog** — item cards/table; create/edit dialog (type, cost, stock, image); coupon-code paste area showing remaining-code count
4. **Redemptions** — pending queue with approve/reject (+note) actions; status filter for history

## FE (end-user) UI

- **`/rewards` page** — balance card (points, level badge, progress bar to next level), tabs: point history / reward catalog with Redeem + confirm dialog (coupon code shown in a success dialog) / my redemptions
- **Profile** — points total + level badge
- **Badges beside names** — review cards and comments render the author's level badge (small colored chip with icon) from the new `author_badge` response field

## Testing

- Go table-driven service tests: cap enforcement (daily + lifetime), balance math, level computation, redemption state machine (coupon claim, manual approve, reject-refund), concurrency-sensitive paths
- Handler smoke tests for auth/admin gating and error codes
- Manual end-to-end pass: earn via review/comment/login/profile → see badge on review card → redeem both item types → admin approves/rejects in CMS

## Out of scope (explicitly)

- Deducting points when a review/comment is later deleted (user chose daily caps as the only anti-abuse rule)
- Point expiry
- Notifications/emails on redemption status changes
