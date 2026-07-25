# Rewards Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a signed-in leaderboard to the reward system with four timeframes (all-time, month, week, today), strict ranking, pagination, and a pinned "your rank" row.

**Architecture:** Backend follows the existing `be/internal/rewards` layering (repo → service → handler → route). All-time ranks by `reward_balances.lifetime_points`; windowed timeframes sum positive `reward_transactions` since a Go-computed UTC window start. Because results are strictly ordered and paginated, a row's rank is simply `offset + position`, so no SQL window functions are needed. Frontend adds one Leaderboard tab to the existing Rewards page.

**Tech Stack:** Go (chi, database/sql, MySQL 8.4), React + TypeScript, TanStack Query, Tailwind/shadcn.

## Global Constraints

- Module path: `final-review/be` (imports like `final-review/be/internal/rewards`).
- Reuse existing helpers in `handlers.go`: `writeJSON`, `writeErr`, `qInt`, `middleware.UserIDFromCtx`. Do not add new HTTP helpers.
- Windowed sums use `points > 0` only (total points *gained*) — deliberately simpler than `Repo.WindowPoints`, which excludes `redemption_spend`/`redemption_refund`/`campaign_reward` for campaign progress. Do not copy that exclusion here.
- All window boundaries in **UTC**. Week starts **Monday**.
- Level for a user comes from `Repo.LevelsForUsers` (keyed on lifetime_points), exposed as `*Badge` via `BadgeOf`.
- Run Go tests in the backend container: `docker exec be-api-1 sh -c 'cd /app && go test ./internal/rewards/...'` (fallback if Go is installed locally: `cd be && go test ./internal/rewards/...`).
- Frontend has no test suite; verify with `cd fe && npm run lint && npm run build`.
- Branch: `feat/rewards-leaderboard` (already created, off `main`). Never push to `main`.

---

### Task 1: Migration — leaderboard indexes

**Files:**
- Create: `be/migrations/010_leaderboard.sql`

**Interfaces:**
- Produces: two indexes supporting the queries in Tasks 3–4. No code depends on this at compile time.

- [ ] **Step 1: Write the migration**

```sql
-- Indexes supporting the rewards leaderboard.
-- Windowed boards scan reward_transactions by created_at then group by user;
-- the existing idx_reward_tx_user_time leads with user_id and does not serve it.
CREATE INDEX idx_reward_tx_time_user_points
    ON reward_transactions (created_at, user_id, points);

-- All-time board orders reward_balances by lifetime_points.
CREATE INDEX idx_reward_balances_lifetime
    ON reward_balances (lifetime_points);
```

- [ ] **Step 2: Apply it to the dev DB**

Run:
```bash
DBPW=$(docker exec common-mysql-1 sh -c 'echo $MYSQL_ROOT_PASSWORD')
docker exec -i common-mysql-1 mysql -uroot -p"$DBPW" review-new < be/migrations/010_leaderboard.sql
```
Expected: no output (success). Re-running would error on duplicate index — that is fine, it means it applied.

- [ ] **Step 3: Verify the indexes exist**

Run:
```bash
docker exec common-mysql-1 mysql -uroot -p"$DBPW" review-new -e "SHOW INDEX FROM reward_transactions WHERE Key_name='idx_reward_tx_time_user_points'; SHOW INDEX FROM reward_balances WHERE Key_name='idx_reward_balances_lifetime';"
```
Expected: rows listed for both index names.

- [ ] **Step 4: Commit**

```bash
git add be/migrations/010_leaderboard.sql
git commit -m "feat(rewards): indexes for leaderboard queries"
```

---

### Task 2: Timeframe window-start helper

**Files:**
- Create: `be/internal/rewards/leaderboard.go`
- Test: `be/internal/rewards/leaderboard_test.go`

**Interfaces:**
- Produces: `func WindowStart(timeframe string, now time.Time) (start time.Time, windowed, valid bool)` — `valid=false` for unknown timeframe; for `"all"`, `windowed=false` and `start` is the zero time; for `today|week|month`, `windowed=true` with the UTC start.

- [ ] **Step 1: Write the failing test**

```go
package rewards

import (
	"testing"
	"time"
)

func TestWindowStart(t *testing.T) {
	// A Wednesday: 2026-07-22 15:04 UTC.
	now := time.Date(2026, 7, 22, 15, 4, 0, 0, time.UTC)

	if _, windowed, valid := WindowStart("all", now); !valid || windowed {
		t.Fatalf("all: valid=%v windowed=%v want true,false", valid, windowed)
	}
	if s, windowed, valid := WindowStart("today", now); !valid || !windowed ||
		!s.Equal(time.Date(2026, 7, 22, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("today start=%v", s)
	}
	if s, _, _ := WindowStart("week", now); !s.Equal(time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("week start=%v want Monday 2026-07-20", s) // Wed -> Mon
	}
	if s, _, _ := WindowStart("month", now); !s.Equal(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("month start=%v", s)
	}
	// Sunday must map back to the previous Monday.
	sun := time.Date(2026, 7, 26, 9, 0, 0, 0, time.UTC)
	if s, _, _ := WindowStart("week", sun); !s.Equal(time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("sunday week start=%v want 2026-07-20", s)
	}
	if _, _, valid := WindowStart("garbage", now); valid {
		t.Fatalf("garbage should be invalid")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec be-api-1 sh -c 'cd /app && go test ./internal/rewards/ -run TestWindowStart'`
Expected: FAIL — `undefined: WindowStart`.

- [ ] **Step 3: Write the implementation**

```go
package rewards

import "time"

// WindowStart returns the UTC start instant for a leaderboard timeframe.
// valid is false for an unknown timeframe. For "all", windowed is false and
// start is the zero time (the caller ranks by lifetime_points instead).
func WindowStart(timeframe string, now time.Time) (start time.Time, windowed, valid bool) {
	now = now.UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	switch timeframe {
	case "all":
		return time.Time{}, false, true
	case "today":
		return midnight, true, true
	case "week":
		wd := int(now.Weekday()) // Sunday=0 .. Saturday=6
		if wd == 0 {
			wd = 7
		}
		return midnight.AddDate(0, 0, -(wd - 1)), true, true
	case "month":
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC), true, true
	default:
		return time.Time{}, false, false
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec be-api-1 sh -c 'cd /app && go test ./internal/rewards/ -run TestWindowStart'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/internal/rewards/leaderboard.go be/internal/rewards/leaderboard_test.go
git commit -m "feat(rewards): timeframe window-start helper"
```

---

### Task 3: Models, error, and repo queries

**Files:**
- Modify: `be/internal/rewards/models.go` (append structs)
- Modify: `be/internal/rewards/errors.go` (add `ErrBadTimeframe`)
- Modify: `be/internal/rewards/repo.go` (append methods)

**Interfaces:**
- Consumes: `Badge`, `BadgeOf`, `LevelFor`, `Repo.LevelsForUsers` (existing).
- Produces:
  - `type LeaderboardRow struct { UserID int64; Username, AvatarURL string; Points int }`
  - `type LeaderboardEntry struct { Rank int; UserID int64; Username, AvatarURL string; Level *Badge; Points int; IsMe bool }`
  - `type LeaderboardMe struct { Rank, Points int; Unranked bool }`
  - `type LeaderboardView struct { Timeframe string; Total int; Entries []LeaderboardEntry; Me LeaderboardMe }`
  - `var ErrBadTimeframe`
  - `func (r *Repo) LeaderboardPage(ctx context.Context, start *time.Time, limit, offset int) ([]LeaderboardRow, error)` — `start == nil` → all-time.
  - `func (r *Repo) LeaderboardTotal(ctx context.Context, start *time.Time) (int, error)`
  - `func (r *Repo) UserRank(ctx context.Context, start *time.Time, userID int64) (rank, points int, err error)` — `rank == 0` when the user has 0 points in the window.

- [ ] **Step 1: Append the models**

Add to the end of `be/internal/rewards/models.go`:

```go
// ── Leaderboard ─────────────────────────────────────────────────────────
type LeaderboardRow struct {
	UserID    int64
	Username  string
	AvatarURL string
	Points    int
}

type LeaderboardEntry struct {
	Rank      int    `json:"rank"`
	UserID    int64  `json:"user_id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
	Level     *Badge `json:"level"`
	Points    int    `json:"points"`
	IsMe      bool   `json:"is_me"`
}

type LeaderboardMe struct {
	Rank     int  `json:"rank"`
	Points   int  `json:"points"`
	Unranked bool `json:"unranked"`
}

type LeaderboardView struct {
	Timeframe string             `json:"timeframe"`
	Total     int                `json:"total"`
	Entries   []LeaderboardEntry `json:"entries"`
	Me        LeaderboardMe      `json:"me"`
}
```

- [ ] **Step 2: Add the error**

In `be/internal/rewards/errors.go`, add inside the `var (...)` block:

```go
	ErrBadTimeframe       = errors.New("invalid timeframe")
```

- [ ] **Step 3: Append the repo queries**

Add to the end of `be/internal/rewards/repo.go` (the file already imports `context`, `database/sql`, `time`):

```go
// LeaderboardPage returns one ranked page. start == nil ranks by all-time
// lifetime_points; otherwise it sums positive transactions since start.
func (r *Repo) LeaderboardPage(ctx context.Context, start *time.Time, limit, offset int) ([]LeaderboardRow, error) {
	var (
		rows *sql.Rows
		err  error
	)
	if start == nil {
		rows, err = r.db.QueryContext(ctx,
			`SELECT b.user_id, u.username, u.avatar_url, b.lifetime_points
			 FROM reward_balances b JOIN users u ON u.id = b.user_id
			 WHERE b.lifetime_points > 0
			 ORDER BY b.lifetime_points DESC, b.user_id ASC
			 LIMIT ? OFFSET ?`, limit, offset)
	} else {
		rows, err = r.db.QueryContext(ctx,
			`SELECT t.user_id, u.username, u.avatar_url, SUM(t.points) AS points
			 FROM reward_transactions t JOIN users u ON u.id = t.user_id
			 WHERE t.points > 0 AND t.created_at >= ?
			 GROUP BY t.user_id, u.username, u.avatar_url
			 HAVING points > 0
			 ORDER BY points DESC, t.user_id ASC
			 LIMIT ? OFFSET ?`, *start, limit, offset)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []LeaderboardRow{}
	for rows.Next() {
		var lr LeaderboardRow
		if err := rows.Scan(&lr.UserID, &lr.Username, &lr.AvatarURL, &lr.Points); err != nil {
			return nil, err
		}
		out = append(out, lr)
	}
	return out, rows.Err()
}

// LeaderboardTotal counts ranked users (nonzero metric) for a timeframe.
func (r *Repo) LeaderboardTotal(ctx context.Context, start *time.Time) (int, error) {
	var n int
	if start == nil {
		err := r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reward_balances WHERE lifetime_points > 0`).Scan(&n)
		return n, err
	}
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM (
			SELECT t.user_id FROM reward_transactions t
			WHERE t.points > 0 AND t.created_at >= ?
			GROUP BY t.user_id HAVING SUM(t.points) > 0
		 ) x`, *start).Scan(&n)
	return n, err
}

// UserRank returns the user's 1-based rank and points for a timeframe. rank is
// 0 when the user has 0 points in the window (unranked). Tie-break matches
// LeaderboardPage: points DESC, then user_id ASC.
func (r *Repo) UserRank(ctx context.Context, start *time.Time, userID int64) (int, int, error) {
	var points int
	if start == nil {
		err := r.db.QueryRowContext(ctx,
			`SELECT COALESCE(lifetime_points, 0) FROM reward_balances WHERE user_id = ?`,
			userID).Scan(&points)
		if err != nil && err != sql.ErrNoRows {
			return 0, 0, err
		}
	} else {
		err := r.db.QueryRowContext(ctx,
			`SELECT COALESCE(SUM(points), 0) FROM reward_transactions
			 WHERE user_id = ? AND points > 0 AND created_at >= ?`,
			userID, *start).Scan(&points)
		if err != nil {
			return 0, 0, err
		}
	}
	if points <= 0 {
		return 0, 0, nil
	}

	var ahead int
	if start == nil {
		err := r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reward_balances
			 WHERE lifetime_points > ? OR (lifetime_points = ? AND user_id < ?)`,
			points, points, userID).Scan(&ahead)
		if err != nil {
			return 0, 0, err
		}
	} else {
		err := r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM (
				SELECT t.user_id, SUM(t.points) p FROM reward_transactions t
				WHERE t.points > 0 AND t.created_at >= ?
				GROUP BY t.user_id HAVING p > 0
			 ) x
			 WHERE x.p > ? OR (x.p = ? AND x.user_id < ?)`,
			*start, points, points, userID).Scan(&ahead)
		if err != nil {
			return 0, 0, err
		}
	}
	return ahead + 1, points, nil
}
```

- [ ] **Step 4: Verify it builds**

Run: `docker exec be-api-1 sh -c 'cd /app && go build ./internal/rewards/...'`
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add be/internal/rewards/models.go be/internal/rewards/errors.go be/internal/rewards/repo.go
git commit -m "feat(rewards): leaderboard models and repo queries"
```

---

### Task 4: View assembly, service, handler, route

**Files:**
- Modify: `be/internal/rewards/leaderboard.go` (add `buildLeaderboardView`)
- Modify: `be/internal/rewards/leaderboard_test.go` (add assembly test)
- Modify: `be/internal/rewards/service.go` (add `Leaderboard`)
- Modify: `be/internal/rewards/handlers.go` (add handler)
- Modify: `be/internal/rewards/routes.go` (register route)

**Interfaces:**
- Consumes: `WindowStart`, `LeaderboardRow`, `LeaderboardView`, `Repo.LeaderboardPage/LeaderboardTotal/UserRank/LevelsForUsers`, `BadgeOf`, `ErrBadTimeframe`, `writeJSON`, `writeErr`, `qInt`, `middleware.UserIDFromCtx`.
- Produces:
  - `func buildLeaderboardView(timeframe string, rows []LeaderboardRow, offset, total int, levels map[int64]Level, meID int64, meRank, mePoints int) LeaderboardView`
  - `func (s *Service) Leaderboard(ctx context.Context, timeframe string, userID int64, limit, offset int) (*LeaderboardView, error)`
  - Route `GET /rewards/leaderboard` in the auth group.

- [ ] **Step 1: Write the failing assembly test**

Append to `be/internal/rewards/leaderboard_test.go`:

```go
func TestBuildLeaderboardView(t *testing.T) {
	rows := []LeaderboardRow{
		{UserID: 7, Username: "alice", AvatarURL: "a.jpg", Points: 100},
		{UserID: 9, Username: "bob", Points: 80},
	}
	levels := map[int64]Level{7: {Name: "Gold", Icon: "g", Color: "#f00"}}

	// offset 50 -> ranks continue at 51; meID=9 flags bob; alice has a level, bob nil.
	v := buildLeaderboardView("week", rows, 50, 128, levels, 9, 27, 80)

	if v.Timeframe != "week" || v.Total != 128 {
		t.Fatalf("meta: %+v", v)
	}
	if v.Entries[0].Rank != 51 || v.Entries[1].Rank != 52 {
		t.Fatalf("ranks: %d %d", v.Entries[0].Rank, v.Entries[1].Rank)
	}
	if v.Entries[0].Level == nil || v.Entries[0].Level.Name != "Gold" {
		t.Fatalf("alice level: %+v", v.Entries[0].Level)
	}
	if v.Entries[1].Level != nil {
		t.Fatalf("bob should have no level")
	}
	if v.Entries[0].IsMe || !v.Entries[1].IsMe {
		t.Fatalf("is_me flags wrong")
	}
	if v.Me.Rank != 27 || v.Me.Points != 80 || v.Me.Unranked {
		t.Fatalf("me: %+v", v.Me)
	}

	// Zero points -> unranked.
	u := buildLeaderboardView("today", nil, 0, 0, nil, 9, 0, 0)
	if !u.Me.Unranked || u.Me.Rank != 0 || len(u.Entries) != 0 {
		t.Fatalf("unranked me: %+v entries=%d", u.Me, len(u.Entries))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec be-api-1 sh -c 'cd /app && go test ./internal/rewards/ -run TestBuildLeaderboardView'`
Expected: FAIL — `undefined: buildLeaderboardView`.

- [ ] **Step 3: Add the assembler**

Append to `be/internal/rewards/leaderboard.go`:

```go
// buildLeaderboardView turns ranked rows + a levels map into the API view.
// Rank is offset-relative (offset + position). meRank/mePoints come from
// Repo.UserRank; mePoints <= 0 means the caller is unranked.
func buildLeaderboardView(timeframe string, rows []LeaderboardRow, offset, total int, levels map[int64]Level, meID int64, meRank, mePoints int) LeaderboardView {
	entries := make([]LeaderboardEntry, 0, len(rows))
	for i, row := range rows {
		var level *Badge
		if l, ok := levels[row.UserID]; ok {
			level = BadgeOf(&l)
		}
		entries = append(entries, LeaderboardEntry{
			Rank:      offset + i + 1,
			UserID:    row.UserID,
			Username:  row.Username,
			AvatarURL: row.AvatarURL,
			Level:     level,
			Points:    row.Points,
			IsMe:      row.UserID == meID,
		})
	}
	return LeaderboardView{
		Timeframe: timeframe,
		Total:     total,
		Entries:   entries,
		Me:        LeaderboardMe{Rank: meRank, Points: mePoints, Unranked: mePoints <= 0},
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec be-api-1 sh -c 'cd /app && go test ./internal/rewards/ -run TestBuildLeaderboardView'`
Expected: PASS.

- [ ] **Step 5: Add the service method**

Append to `be/internal/rewards/service.go` (file already imports `context`, `time`):

```go
// Leaderboard returns one ranked page for a timeframe plus the caller's rank.
func (s *Service) Leaderboard(ctx context.Context, timeframe string, userID int64, limit, offset int) (*LeaderboardView, error) {
	start, windowed, valid := WindowStart(timeframe, time.Now())
	if !valid {
		return nil, ErrBadTimeframe
	}
	var startPtr *time.Time
	if windowed {
		startPtr = &start
	}

	rows, err := s.repo.LeaderboardPage(ctx, startPtr, limit, offset)
	if err != nil {
		return nil, err
	}
	total, err := s.repo.LeaderboardTotal(ctx, startPtr)
	if err != nil {
		return nil, err
	}
	meRank, mePoints, err := s.repo.UserRank(ctx, startPtr, userID)
	if err != nil {
		return nil, err
	}

	ids := make([]int64, len(rows))
	for i, row := range rows {
		ids[i] = row.UserID
	}
	levels, err := s.repo.LevelsForUsers(ctx, ids)
	if err != nil {
		return nil, err
	}

	v := buildLeaderboardView(timeframe, rows, offset, total, levels, userID, meRank, mePoints)
	return &v, nil
}
```

- [ ] **Step 6: Add the handler**

In `be/internal/rewards/handlers.go`, add after the `me` handler (the file already imports `errors`, `net/http`, `middleware`):

```go
func (a *api) leaderboard(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	tf := r.URL.Query().Get("timeframe")
	if tf == "" {
		tf = "all"
	}
	limit := qInt(r, "limit", 50)
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}
	offset := qInt(r, "offset", 0)
	if offset < 0 {
		offset = 0
	}
	v, err := a.svc.Leaderboard(r.Context(), tf, uid, limit, offset)
	if errors.Is(err, ErrBadTimeframe) {
		writeErr(w, http.StatusBadRequest, "invalid timeframe")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "failed to load leaderboard")
		return
	}
	writeJSON(w, http.StatusOK, v)
}
```

- [ ] **Step 7: Register the route**

In `be/internal/rewards/routes.go`, inside the `r.Use(auth)` group (next to `r.Get("/rewards/me", a.me)`), add:

```go
		r.Get("/rewards/leaderboard", a.leaderboard)
```

- [ ] **Step 8: Build, run all rewards tests, smoke-test the endpoint**

Run:
```bash
docker exec be-api-1 sh -c 'cd /app && go build ./... && go test ./internal/rewards/...'
```
Expected: build clean; tests PASS.

Then smoke-test against the running server (needs a valid token — register a throwaway user):
```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"lb-smoke@example.com","password":"password123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s "http://localhost:8080/api/v1/rewards/leaderboard?timeframe=all&limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s -o /dev/null -w "bad timeframe -> %{http_code}\n" \
  "http://localhost:8080/api/v1/rewards/leaderboard?timeframe=nope" -H "Authorization: Bearer $TOKEN"
```
Expected: JSON with `entries`, `total`, `me` (the new user is unranked → `me.unranked=true`); second call prints `bad timeframe -> 400`. Clean up:
```bash
DBPW=$(docker exec common-mysql-1 sh -c 'echo $MYSQL_ROOT_PASSWORD')
docker exec common-mysql-1 mysql -uroot -p"$DBPW" review-new -e "DELETE FROM users WHERE email='lb-smoke@example.com';"
```

- [ ] **Step 9: Commit**

```bash
git add be/internal/rewards/leaderboard.go be/internal/rewards/leaderboard_test.go \
        be/internal/rewards/service.go be/internal/rewards/handlers.go be/internal/rewards/routes.go
git commit -m "feat(rewards): leaderboard service, handler, and route"
```

---

### Task 5: Frontend API method and types

**Files:**
- Modify: `fe/src/lib/rewardsApi.ts`

**Interfaces:**
- Consumes: `apiFetch`, `RewardLevel` (existing in this file).
- Produces:
  - `interface LeaderboardEntry { rank: number; user_id: number; username: string; avatar_url: string; level: RewardLevel | null; points: number; is_me: boolean }`
  - `interface LeaderboardMe { rank: number; points: number; unranked: boolean }`
  - `interface LeaderboardView { timeframe: string; total: number; entries: LeaderboardEntry[]; me: LeaderboardMe }`
  - `rewardsApi.leaderboard(t, timeframe, limit, offset) => Promise<LeaderboardView>`

- [ ] **Step 1: Add the types**

In `fe/src/lib/rewardsApi.ts`, after the existing `export interface RewardLevel` line, add:

```ts
export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  avatar_url: string;
  level: RewardLevel | null;
  points: number;
  is_me: boolean;
}
export interface LeaderboardMe { rank: number; points: number; unranked: boolean; }
export interface LeaderboardView {
  timeframe: string;
  total: number;
  entries: LeaderboardEntry[];
  me: LeaderboardMe;
}
```

- [ ] **Step 2: Add the API method**

Inside the `export const rewardsApi = { ... }` object, add a member (mirror the existing arrow-function style):

```ts
  leaderboard: (t: string | null, timeframe: string, limit: number, offset: number) =>
    apiFetch<LeaderboardView>(
      `/rewards/leaderboard?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&offset=${offset}`,
      {},
      t,
    ),
```

Note: the backend returns `level` as a full `RewardLevel`-shaped object here; the UI only reads `name/icon/color`, which are present.

- [ ] **Step 3: Verify it typechecks**

Run: `cd fe && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add fe/src/lib/rewardsApi.ts
git commit -m "feat(fe): rewards leaderboard api method and types"
```

---

### Task 6: Frontend Leaderboard tab

**Files:**
- Create: `fe/src/pages/rewards/LeaderboardTab.tsx`
- Modify: `fe/src/pages/Rewards.tsx` (import + tab trigger + tab content)

**Interfaces:**
- Consumes: `rewardsApi.leaderboard`, `LeaderboardEntry`, `LeaderboardView` (Task 5); `UserAvatar` (`@/components/UserAvatar`), `LevelBadge` (`@/components/LevelBadge`), `Button`, `useAuth`, `useInfiniteQuery`.

**Note on copy:** The existing Rewards page (`Rewards.tsx`) uses **hardcoded English** tab labels and does **not** use `react-i18next` (there is no `rewards` locale namespace). Match that — use plain English strings, no `useTranslation`, no locale edits.

- [ ] **Step 1: Create the tab component**

Create `fe/src/pages/rewards/LeaderboardTab.tsx`:

```tsx
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { rewardsApi, type LeaderboardEntry } from "@/lib/rewardsApi";
import { UserAvatar } from "@/components/UserAvatar";
import { LevelBadge } from "@/components/LevelBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIMEFRAMES = [
  { value: "all", label: "All-time" },
  { value: "month", label: "This month" },
  { value: "week", label: "This week" },
  { value: "today", label: "Today" },
] as const;
type Timeframe = (typeof TIMEFRAMES)[number]["value"];
const PAGE_SIZE = 50;
const MEDALS = ["🥇", "🥈", "🥉"];

function Row({ entry, fallbackName }: { entry: LeaderboardEntry; fallbackName?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border px-3 py-2",
        entry.is_me && "border-primary/50 bg-primary/5",
      )}
    >
      <span className="w-8 shrink-0 text-center font-semibold text-muted-foreground">
        {entry.rank <= 3 ? MEDALS[entry.rank - 1] : entry.rank}
      </span>
      <UserAvatar name={entry.username || fallbackName || ""} src={entry.avatar_url} size="xs" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground">
            {entry.username || fallbackName}
          </span>
          {entry.level && (
            <LevelBadge name={entry.level.name} icon={entry.level.icon} color={entry.level.color} />
          )}
        </div>
      </div>
      <span className="shrink-0 font-semibold text-foreground">{entry.points} pts</span>
    </div>
  );
}

export function LeaderboardTab() {
  const { token } = useAuth();
  const [timeframe, setTimeframe] = useState<Timeframe>("all");

  const q = useInfiniteQuery({
    queryKey: ["leaderboard", timeframe],
    queryFn: ({ pageParam }) => rewardsApi.leaderboard(token, timeframe, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.entries.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: !!token,
  });

  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];
  const me = q.data?.pages[0]?.me;
  const meInList = entries.some((e) => e.is_me);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TIMEFRAMES.map((tf) => (
          <Button
            key={tf.value}
            size="sm"
            variant={tf.value === timeframe ? "default" : "outline"}
            onClick={() => setTimeframe(tf.value)}
          >
            {tf.label}
          </Button>
        ))}
      </div>

      {q.isError ? (
        <p className="py-8 text-center text-destructive">Could not load the leaderboard.</p>
      ) : q.isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No one's on the board yet</p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((e) => (
              <Row key={e.user_id} entry={e} />
            ))}
          </div>

          {q.hasNextPage && (
            <div className="text-center">
              <Button variant="outline" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}

          {me && !me.unranked && !meInList && (
            <div className="pt-2">
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your rank
              </p>
              <Row
                entry={{
                  rank: me.rank,
                  user_id: -1,
                  username: "",
                  avatar_url: "",
                  level: null,
                  points: me.points,
                  is_me: true,
                }}
                fallbackName="You"
              />
            </div>
          )}

          {me && me.unranked && (
            <p className="pt-2 text-center text-sm text-muted-foreground">
              Earn points to join the board
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the tab into the Rewards page**

In `fe/src/pages/Rewards.tsx`:

1. Add the import near the other imports:
```tsx
import { LeaderboardTab } from "@/pages/rewards/LeaderboardTab";
```
2. In the `<TabsList>` (currently `History`/`Catalog`/`My Redemptions`/`Campaigns`), add as the first trigger — plain string, matching the existing hardcoded labels:
```tsx
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
```
3. After the existing `<TabsContent>` blocks, add:
```tsx
          <TabsContent value="leaderboard">
            <LeaderboardTab />
          </TabsContent>
```
(Leave any existing `defaultValue` on `<Tabs>` unchanged so the default tab is preserved.)

- [ ] **Step 3: Lint and build**

Run: `cd fe && npm run lint && npm run build`
Expected: no new lint errors in `LeaderboardTab.tsx`, `Rewards.tsx`, or `rewardsApi.ts`; build succeeds.

- [ ] **Step 4: Visual check (running app)**

With the dev server on :5173 and API on :8080, sign in, open `/rewards`, and confirm: the Leaderboard tab lists ranked users with medals for the top 3; switching timeframes refetches; "Load more" appears only when more than one page exists; your own row is highlighted (or pinned / "Earn points to join the board" when applicable).

- [ ] **Step 5: Commit**

```bash
git add fe/src/pages/rewards/LeaderboardTab.tsx fe/src/pages/Rewards.tsx
git commit -m "feat(fe): rewards leaderboard tab"
```

---

## Self-Review

**Spec coverage:**
- Four timeframes → Task 2 (`WindowStart`) + Task 3 queries. ✓
- All-time = lifetime_points; windowed = SUM(points>0) → Task 3. ✓
- Logged-in only → route in auth group (Task 4). ✓
- Pinned "your rank" + unranked → `UserRank` (Task 3), `buildLeaderboardView` (Task 4), pinned row (Task 6). ✓
- Strict ranks + tie-break → `offset + position` and `user_id` tie-break in queries/`UserRank`. ✓
- Pagination → `limit`/`offset` + `total`, `useInfiniteQuery` load-more. ✓
- Indexes + upgrade path → Task 1 migration; upgrade path is documented in the spec (not built). ✓
- Levels null-safe, empty board, offset-beyond-total → Task 4 assembler + Task 6 empty state. ✓
- Tests for window/rank/assembly → Tasks 2 and 4. ✓ (Repo DB methods are not unit-tested, consistent with the existing repo, and are covered by the Task 4 Step 8 smoke test.)

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `LeaderboardRow/Entry/Me/View` used identically across Tasks 3–5; `WindowStart` return shape matches its use in `Service.Leaderboard`; `buildLeaderboardView` signature matches its call site; FE types mirror the Go JSON tags. ✓
