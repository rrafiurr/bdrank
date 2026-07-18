# Reward System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the reward system from `docs/superpowers/specs/2026-07-05-reward-system-design.md` — a self-contained Go `rewards` package (points, levels, redemption catalog, admin-run campaigns), its host-app integration, the CMS admin UI, and the FE end-user UI.

**Architecture:** A portable Go package `be/internal/rewards` owns its models, pure decision logic, SQL repository, service, and HTTP handlers, mounted into the existing chi router. Host coupling is four `Award()` calls at interaction points plus badge decoration on list endpoints. CMS gains a 5th "Rewards" section (five tabs); FE gains a `/rewards` page and level badges beside author names.

**Tech Stack:** Go 1.22, chi v5, MySQL (`go-sql-driver/mysql`, `parseTime=true`, UTC). Frontends: Vite + React 18 + TypeScript, TanStack Query, shadcn/ui (radix), sonner toasts, react-router-dom v6.

## Global Constraints

- Go module path is `final-review/be`; all internal imports are `final-review/be/internal/...`.
- All HTTP routes are served under `/api/v1` (spec paths written as `/api/rewards/...` become `/api/v1/rewards/...`).
- All reward tables are prefixed `reward_`, created in **one** new migration `be/migrations/009_rewards.sql`, InnoDB, `DEFAULT CHARSET=utf8mb4`, following the style of `008_embed_tokens.sql` (idempotent `CREATE TABLE IF NOT EXISTS`, FKs to `users(id)` with `ON DELETE CASCADE`). Migrations auto-run on first DB boot.
- Go is **not** installed locally. Run every Go command via Docker from `be/`:
  `docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./internal/rewards/...`
  (substitute `go build ./...`, `go vet ./...` as needed). Add `go mod tidy` via the existing `make tidy` if imports change.
- HTTP handlers use the existing helpers in `be/internal/handlers/response.go` **only within that package**; the `rewards` package is self-contained and defines its own tiny `writeJSON`/`writeError` (do not import `handlers`). User identity inside `rewards` handlers comes from `middleware.UserIDFromCtx(ctx)` (import `final-review/be/internal/middleware`) — this is the one host dependency the handlers rely on, matching how every other authed handler works.
- `Award()` is fire-and-forget: it returns an error for logging but callers **must not** fail the host action on it.
- Money/points are integers. Levels are computed from `lifetime_points` (never from spendable `points`).
- Frontend API base is already `…/api/v1`; both `apiFetch` helpers prepend it. CMS uses `apiFetch<T>(path, options)`; FE uses `apiFetch<T>(path, options, token?)`.

---

## File Structure

**Backend — new package `be/internal/rewards/`:**
- `models.go` — DB row structs + API view structs.
- `caps.go` — pure cap logic. `caps_test.go`.
- `levels.go` — pure level logic. `levels_test.go`.
- `campaign_logic.go` — pure campaign/goal logic. `campaign_logic_test.go`.
- `repo.go` — all SQL (rules, transactions, balances, levels, items, codes, redemptions, campaigns, goals, progress).
- `service.go` — orchestration: `Award`, `Me`, `Redeem`, campaign read/redeem, admin CRUD, `LevelsForUsers`.
- `handlers.go` — HTTP handlers (user + admin).
- `routes.go` — `RegisterRoutes`.
- `errors.go` — sentinel errors (`ErrInsufficientPoints`, `ErrOutOfStock`, `ErrGoalNotAchieved`, `ErrAlreadyRedeemed`, `ErrCampaignClosed`, `ErrNotAchievable`).

**Backend — modified host files:**
- `be/migrations/009_rewards.sql` — new.
- `be/internal/router/router.go` — construct service, mount routes, pass service to 4 handlers.
- `be/internal/handlers/reviews.go`, `comments.go`, `auth.go`, `profile.go` — add `Award` calls.
- `be/internal/models/models.go` — add `AuthorBadge *Badge` to `Review` and `Comment` (type defined in models to avoid a cycle; `rewards` maps into it).

**CMS — `cms/src/`:**
- `lib/rewardsApi.ts` — types + fetch wrappers.
- `pages/Rewards.tsx` — container with 5 tabs.
- `pages/rewards/{RulesTab,LevelsTab,CatalogTab,RedemptionsTab,CampaignsTab}.tsx`.
- `components/Sidebar.tsx`, `App.tsx` — nav entry + route.

**FE — `fe/src/`:**
- `lib/rewardsApi.ts` — types + fetch wrappers.
- `pages/Rewards.tsx` — balance card + tabs (history / catalog / redemptions / campaigns).
- `components/LevelBadge.tsx` — reusable badge chip.
- `App.tsx` — route; `pages/Profile.tsx` — points + badge; review/comment card components — badge beside author.

---

## Phase A — Backend rewards package (portable core)

### Task 1: Migration `009_rewards.sql`

**Files:**
- Create: `be/migrations/009_rewards.sql`

**Interfaces:**
- Produces: the eight `reward_*` tables every later task queries. Column names here are the contract for `repo.go`.

- [ ] **Step 1: Write the migration**

```sql
-- Reward system: points economy, levels, redemption catalog, and admin campaigns.
-- All tables prefixed reward_. Self-contained; only FK dependency is users(id).

CREATE TABLE IF NOT EXISTS reward_rules (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    event_type    VARCHAR(64)  NOT NULL UNIQUE,
    points        INT          NOT NULL DEFAULT 0,
    daily_cap     INT          NULL,
    lifetime_cap  INT          NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO reward_rules (event_type, points, daily_cap, lifetime_cap, is_active) VALUES
    ('review_created',    10, NULL, NULL, 1),
    ('review_with_image',  5, NULL, NULL, 1),
    ('comment_created',    2, 10,   NULL, 1),
    ('daily_login',        1, 1,    NULL, 1),
    ('profile_completed',  5, NULL, 1,    1)
ON DUPLICATE KEY UPDATE event_type = event_type;

CREATE TABLE IF NOT EXISTS reward_transactions (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    event_type  VARCHAR(64)  NOT NULL,
    points      INT          NOT NULL,
    ref_type    VARCHAR(32)  NOT NULL DEFAULT '',
    ref_id      BIGINT       NULL,
    note        VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_tx_user_event_time (user_id, event_type, created_at),
    INDEX idx_reward_tx_user_time (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_balances (
    user_id         BIGINT     PRIMARY KEY,
    points          INT        NOT NULL DEFAULT 0,
    lifetime_points INT        NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_levels (
    id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(64)  NOT NULL,
    min_points INT          NOT NULL,
    icon       VARCHAR(64)  NOT NULL DEFAULT '',
    color      VARCHAR(16)  NOT NULL DEFAULT '',
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_reward_levels_min (min_points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_items (
    id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
    name             VARCHAR(128) NOT NULL,
    description      VARCHAR(500) NOT NULL DEFAULT '',
    image_url        VARCHAR(500) NOT NULL DEFAULT '',
    points_cost      INT          NOT NULL,
    fulfillment_type ENUM('coupon','manual') NOT NULL DEFAULT 'manual',
    stock            INT          NULL,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_coupon_codes (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    item_id       BIGINT       NOT NULL,
    code          VARCHAR(128) NOT NULL,
    redemption_id BIGINT       NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_codes_item_claimed (item_id, redemption_id),
    FOREIGN KEY (item_id) REFERENCES reward_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    item_id     BIGINT       NULL,
    item_name   VARCHAR(128) NOT NULL,
    points_spent INT         NOT NULL,
    status      ENUM('pending','approved','rejected','fulfilled') NOT NULL DEFAULT 'pending',
    coupon_code VARCHAR(128) NOT NULL DEFAULT '',
    admin_note  VARCHAR(500) NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP    NULL,
    INDEX idx_reward_redemptions_user (user_id, created_at),
    INDEX idx_reward_redemptions_status (status, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_campaigns (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
    name        VARCHAR(128) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    image_url   VARCHAR(500) NOT NULL DEFAULT '',
    starts_at   TIMESTAMP    NOT NULL,
    ends_at     TIMESTAMP    NOT NULL,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_campaigns_window (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_campaign_goals (
    id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
    campaign_id      BIGINT       NOT NULL,
    name             VARCHAR(128) NOT NULL,
    threshold_points INT          NOT NULL,
    sort_order       INT          NOT NULL DEFAULT 0,
    reward_points    INT          NOT NULL DEFAULT 0,
    reward_item_id   BIGINT       NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_goals_campaign (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES reward_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_campaign_progress (
    id               BIGINT     PRIMARY KEY AUTO_INCREMENT,
    campaign_id      BIGINT     NOT NULL,
    user_id          BIGINT     NOT NULL,
    redeemed_goal_id BIGINT     NULL,
    status           ENUM('active','redeemed','expired') NOT NULL DEFAULT 'active',
    redeemed_at      TIMESTAMP  NULL,
    updated_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reward_progress (campaign_id, user_id),
    FOREIGN KEY (campaign_id) REFERENCES reward_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Verify it applies.** Against a scratch MySQL (or the dev DB), run the file and confirm no errors:

Run: `docker run --rm -v "$PWD":/app -w /app mysql:8 sh -c "echo skip"` — if no MySQL is available, instead eyeball the DDL and defer verification to Task 2's build. Expected: file parses; when applied, `SHOW TABLES LIKE 'reward_%'` returns 8 rows and `SELECT COUNT(*) FROM reward_rules` returns 5.

- [ ] **Step 3: Commit**

```bash
git add be/migrations/009_rewards.sql
git commit -m "feat(rewards): add 009_rewards migration"
```

---

### Task 2: Models + sentinel errors

**Files:**
- Create: `be/internal/rewards/models.go`, `be/internal/rewards/errors.go`

**Interfaces:**
- Produces: every struct and error the rest of the package uses. Field names are the JSON contract the frontends consume.

- [ ] **Step 1: Write `errors.go`**

```go
package rewards

import "errors"

var (
	ErrInsufficientPoints = errors.New("insufficient points")
	ErrItemInactive       = errors.New("item is not available")
	ErrOutOfStock         = errors.New("out of stock")
	ErrGoalNotAchieved    = errors.New("goal not yet achieved")
	ErrAlreadyRedeemed    = errors.New("already redeemed a goal in this campaign")
	ErrCampaignClosed     = errors.New("campaign is not open for redemption")
	ErrNotFound           = errors.New("not found")
	ErrValidation         = errors.New("validation error")
)
```

- [ ] **Step 2: Write `models.go`**

```go
package rewards

import "time"

// ── DB rows ─────────────────────────────────────────────────────────────
type Rule struct {
	ID          int64     `json:"id"`
	EventType   string    `json:"event_type"`
	Points      int       `json:"points"`
	DailyCap    *int      `json:"daily_cap"`
	LifetimeCap *int      `json:"lifetime_cap"`
	IsActive    bool      `json:"is_active"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Transaction struct {
	ID        int64     `json:"id"`
	EventType string    `json:"event_type"`
	Points    int       `json:"points"`
	RefType   string    `json:"ref_type"`
	RefID     *int64    `json:"ref_id"`
	Note      string    `json:"note"`
	CreatedAt time.Time `json:"created_at"`
}

type Level struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	MinPoints int    `json:"min_points"`
	Icon      string `json:"icon"`
	Color     string `json:"color"`
	IsActive  bool   `json:"is_active"`
}

type Item struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	ImageURL        string `json:"image_url"`
	PointsCost      int    `json:"points_cost"`
	FulfillmentType string `json:"fulfillment_type"` // coupon | manual
	Stock           *int   `json:"stock"`
	IsActive        bool   `json:"is_active"`
	// computed for user-facing list:
	EffectiveStock *int `json:"effective_stock,omitempty"`
	CanAfford      bool `json:"can_afford,omitempty"`
}

type Redemption struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	ItemID      *int64     `json:"item_id"`
	ItemName    string     `json:"item_name"`
	PointsSpent int        `json:"points_spent"`
	Status      string     `json:"status"`
	CouponCode  string     `json:"coupon_code"`
	AdminNote   string     `json:"admin_note"`
	CreatedAt   time.Time  `json:"created_at"`
	ResolvedAt  *time.Time `json:"resolved_at"`
	UserEmail   string     `json:"user_email,omitempty"` // admin list only
}

type Campaign struct {
	ID          int64          `json:"id"`
	Name        string         `json:"name"`
	Description string         `json:"description"`
	ImageURL    string         `json:"image_url"`
	StartsAt    time.Time      `json:"starts_at"`
	EndsAt      time.Time      `json:"ends_at"`
	IsActive    bool           `json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	Goals       []CampaignGoal `json:"goals,omitempty"`
}

type CampaignGoal struct {
	ID              int64  `json:"id"`
	CampaignID      int64  `json:"campaign_id"`
	Name            string `json:"name"`
	ThresholdPoints int    `json:"threshold_points"`
	SortOrder       int    `json:"sort_order"`
	RewardPoints    int    `json:"reward_points"`
	RewardItemID    *int64 `json:"reward_item_id"`
}

type CampaignProgress struct {
	CampaignID     int64      `json:"campaign_id"`
	UserID         int64      `json:"user_id"`
	RedeemedGoalID *int64     `json:"redeemed_goal_id"`
	Status         string     `json:"status"`
	RedeemedAt     *time.Time `json:"redeemed_at"`
}

// ── API views ───────────────────────────────────────────────────────────
type Badge struct {
	Name  string `json:"name"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}

type MeView struct {
	Points          int    `json:"points"`
	LifetimePoints  int    `json:"lifetime_points"`
	CurrentLevel    *Level `json:"current_level"`
	NextLevel       *Level `json:"next_level"`
	PointsToNext    int    `json:"points_to_next"`
}

type CampaignView struct {
	Campaign
	MyPoints       int    `json:"my_points"`
	RedeemedGoalID *int64 `json:"redeemed_goal_id"`
	MyStatus       string `json:"my_status"` // active | redeemed | expired
	AchievedGoalIDs []int64 `json:"achieved_goal_ids"`
}
```

- [ ] **Step 3: Build**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./internal/rewards/...`
Expected: PASS (compiles; unused types are fine at package scope).

- [ ] **Step 4: Commit**

```bash
git add be/internal/rewards/models.go be/internal/rewards/errors.go
git commit -m "feat(rewards): models and sentinel errors"
```

---

### Task 3: Pure cap logic (TDD)

**Files:**
- Create: `be/internal/rewards/caps.go`, `be/internal/rewards/caps_test.go`

**Interfaces:**
- Produces: `func CapReached(rule Rule, todayCount, lifetimeCount int) bool` — true when awarding once more would exceed a cap. `service.Award` consumes it.

- [ ] **Step 1: Write the failing test**

```go
package rewards

import "testing"

func p(n int) *int { return &n }

func TestCapReached(t *testing.T) {
	cases := []struct {
		name         string
		rule         Rule
		today, life  int
		want         bool
	}{
		{"no caps", Rule{DailyCap: nil, LifetimeCap: nil}, 100, 100, false},
		{"under daily", Rule{DailyCap: p(10)}, 9, 0, false},
		{"at daily", Rule{DailyCap: p(10)}, 10, 0, true},
		{"over daily", Rule{DailyCap: p(10)}, 11, 0, true},
		{"at lifetime", Rule{LifetimeCap: p(1)}, 0, 1, true},
		{"under lifetime", Rule{LifetimeCap: p(1)}, 0, 0, false},
		{"daily ok but lifetime hit", Rule{DailyCap: p(10), LifetimeCap: p(1)}, 0, 1, true},
	}
	for _, c := range cases {
		if got := CapReached(c.rule, c.today, c.life); got != c.want {
			t.Errorf("%s: CapReached=%v want %v", c.name, got, c.want)
		}
	}
}
```

- [ ] **Step 2: Run — verify it fails**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./internal/rewards/ -run TestCapReached -v`
Expected: FAIL — `undefined: CapReached`.

- [ ] **Step 3: Implement**

```go
package rewards

// CapReached reports whether awarding one more of this event would exceed a cap.
func CapReached(rule Rule, todayCount, lifetimeCount int) bool {
	if rule.DailyCap != nil && todayCount >= *rule.DailyCap {
		return true
	}
	if rule.LifetimeCap != nil && lifetimeCount >= *rule.LifetimeCap {
		return true
	}
	return false
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./internal/rewards/ -run TestCapReached -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/internal/rewards/caps.go be/internal/rewards/caps_test.go
git commit -m "feat(rewards): pure cap logic with tests"
```

---

### Task 4: Pure level logic (TDD)

**Files:**
- Create: `be/internal/rewards/levels.go`, `be/internal/rewards/levels_test.go`

**Interfaces:**
- Produces:
  - `func LevelFor(levels []Level, lifetime int) *Level` — highest active level with `MinPoints <= lifetime`, or nil.
  - `func NextLevel(levels []Level, lifetime int) (*Level, int)` — the next active level above current and points remaining; `(nil, 0)` at top.
  - Both assume `levels` may be unsorted and may contain inactive rows.

- [ ] **Step 1: Write the failing test**

```go
package rewards

import "testing"

func TestLevelFor(t *testing.T) {
	levels := []Level{
		{ID: 1, Name: "Bronze", MinPoints: 0, IsActive: true},
		{ID: 2, Name: "Silver", MinPoints: 100, IsActive: true},
		{ID: 3, Name: "Gold", MinPoints: 500, IsActive: true},
		{ID: 4, Name: "Hidden", MinPoints: 300, IsActive: false},
	}
	if l := LevelFor(levels, 50); l == nil || l.Name != "Bronze" {
		t.Fatalf("50 -> %v want Bronze", l)
	}
	if l := LevelFor(levels, 100); l == nil || l.Name != "Silver" {
		t.Fatalf("100 -> %v want Silver", l)
	}
	if l := LevelFor(levels, 400); l == nil || l.Name != "Silver" {
		t.Fatalf("400 -> %v want Silver (Hidden inactive)", l)
	}
	none := []Level{{Name: "Silver", MinPoints: 100, IsActive: true}}
	if l := LevelFor(none, 50); l != nil {
		t.Fatalf("below lowest -> %v want nil", l)
	}
}

func TestNextLevel(t *testing.T) {
	levels := []Level{
		{Name: "Bronze", MinPoints: 0, IsActive: true},
		{Name: "Silver", MinPoints: 100, IsActive: true},
		{Name: "Gold", MinPoints: 500, IsActive: true},
	}
	next, need := NextLevel(levels, 40)
	if next == nil || next.Name != "Silver" || need != 60 {
		t.Fatalf("40 -> (%v,%d) want (Silver,60)", next, need)
	}
	top, need := NextLevel(levels, 600)
	if top != nil || need != 0 {
		t.Fatalf("600 -> (%v,%d) want (nil,0)", top, need)
	}
}
```

- [ ] **Step 2: Run — verify it fails**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./internal/rewards/ -run 'TestLevelFor|TestNextLevel' -v`
Expected: FAIL — `undefined: LevelFor`.

- [ ] **Step 3: Implement**

```go
package rewards

import "sort"

func activeSorted(levels []Level) []Level {
	out := make([]Level, 0, len(levels))
	for _, l := range levels {
		if l.IsActive {
			out = append(out, l)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MinPoints < out[j].MinPoints })
	return out
}

// LevelFor returns the highest active level whose MinPoints <= lifetime, or nil.
func LevelFor(levels []Level, lifetime int) *Level {
	s := activeSorted(levels)
	var cur *Level
	for i := range s {
		if s[i].MinPoints <= lifetime {
			l := s[i]
			cur = &l
		} else {
			break
		}
	}
	return cur
}

// NextLevel returns the next active level above the user's lifetime points and
// the points still needed; (nil, 0) when already at the top.
func NextLevel(levels []Level, lifetime int) (*Level, int) {
	for _, l := range activeSorted(levels) {
		if l.MinPoints > lifetime {
			nl := l
			return &nl, l.MinPoints - lifetime
		}
	}
	return nil, 0
}
```

- [ ] **Step 4: Run — verify it passes.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/internal/rewards/levels.go be/internal/rewards/levels_test.go
git commit -m "feat(rewards): pure level logic with tests"
```

---

### Task 5: Pure campaign logic (TDD)

**Files:**
- Create: `be/internal/rewards/campaign_logic.go`, `be/internal/rewards/campaign_logic_test.go`

**Interfaces:**
- Produces:
  - `func AchievedGoalIDs(goals []CampaignGoal, points int) []int64` — ids whose `ThresholdPoints <= points`.
  - `func ValidateRedeem(c Campaign, goals []CampaignGoal, prog *CampaignProgress, goalID int64, points int, now time.Time) error` — the redeem state machine, returning a sentinel error or nil.

- [ ] **Step 1: Write the failing test**

```go
package rewards

import (
	"errors"
	"testing"
	"time"
)

func TestAchievedGoalIDs(t *testing.T) {
	goals := []CampaignGoal{
		{ID: 1, ThresholdPoints: 100},
		{ID: 2, ThresholdPoints: 250},
		{ID: 3, ThresholdPoints: 500},
	}
	got := AchievedGoalIDs(goals, 250)
	if len(got) != 2 || got[0] != 1 || got[1] != 2 {
		t.Fatalf("250 -> %v want [1 2]", got)
	}
	if len(AchievedGoalIDs(goals, 50)) != 0 {
		t.Fatalf("50 should achieve none")
	}
}

func TestValidateRedeem(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	open := Campaign{IsActive: true, StartsAt: now.Add(-24 * time.Hour), EndsAt: now.Add(24 * time.Hour)}
	goals := []CampaignGoal{{ID: 1, ThresholdPoints: 100}, {ID: 2, ThresholdPoints: 250}}

	if err := ValidateRedeem(open, goals, nil, 1, 120, now); err != nil {
		t.Fatalf("valid redeem errored: %v", err)
	}
	if err := ValidateRedeem(open, goals, nil, 2, 120, now); !errors.Is(err, ErrGoalNotAchieved) {
		t.Fatalf("unachieved goal -> %v want ErrGoalNotAchieved", err)
	}
	redeemed := &CampaignProgress{Status: "redeemed", RedeemedGoalID: ptr64(1)}
	if err := ValidateRedeem(open, goals, redeemed, 2, 300, now); !errors.Is(err, ErrAlreadyRedeemed) {
		t.Fatalf("second redeem -> %v want ErrAlreadyRedeemed", err)
	}
	ended := Campaign{IsActive: true, StartsAt: now.Add(-48 * time.Hour), EndsAt: now.Add(-time.Hour)}
	if err := ValidateRedeem(ended, goals, nil, 1, 120, now); !errors.Is(err, ErrCampaignClosed) {
		t.Fatalf("ended -> %v want ErrCampaignClosed", err)
	}
	if err := ValidateRedeem(open, goals, nil, 99, 120, now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown goal -> %v want ErrNotFound", err)
	}
}

func ptr64(n int64) *int64 { return &n }
```

- [ ] **Step 2: Run — verify it fails**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./internal/rewards/ -run 'TestAchieved|TestValidateRedeem' -v`
Expected: FAIL — `undefined: AchievedGoalIDs`.

- [ ] **Step 3: Implement**

```go
package rewards

import "time"

// AchievedGoalIDs returns the ids of goals whose threshold is met by points,
// in ascending threshold order.
func AchievedGoalIDs(goals []CampaignGoal, points int) []int64 {
	var out []int64
	for _, g := range goals {
		if points >= g.ThresholdPoints {
			out = append(out, g.ID)
		}
	}
	return out
}

// ValidateRedeem enforces the campaign redeem state machine.
func ValidateRedeem(c Campaign, goals []CampaignGoal, prog *CampaignProgress, goalID int64, points int, now time.Time) error {
	if !c.IsActive || now.Before(c.StartsAt) || now.After(c.EndsAt) {
		return ErrCampaignClosed
	}
	if prog != nil && prog.Status == "redeemed" {
		return ErrAlreadyRedeemed
	}
	var goal *CampaignGoal
	for i := range goals {
		if goals[i].ID == goalID {
			goal = &goals[i]
			break
		}
	}
	if goal == nil {
		return ErrNotFound
	}
	if points < goal.ThresholdPoints {
		return ErrGoalNotAchieved
	}
	return nil
}
```

- [ ] **Step 4: Run — verify it passes.** Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/internal/rewards/campaign_logic.go be/internal/rewards/campaign_logic_test.go
git commit -m "feat(rewards): pure campaign logic with tests"
```

---

### Task 6: Repository — rules, transactions, balances, levels

**Files:**
- Create: `be/internal/rewards/repo.go`

**Interfaces:**
- Consumes: `models.go` structs.
- Produces (methods on `*Repo`, `NewRepo(db *sql.DB) *Repo`):
  - `RuleByType(ctx, eventType string) (*Rule, error)` — `ErrNotFound` if missing.
  - `CountToday(ctx, userID int64, eventType string) (int, error)` — transactions today (UTC calendar day).
  - `CountLifetime(ctx, userID int64, eventType string) (int, error)`.
  - `ApplyAward(ctx, userID int64, eventType, refType string, refID int64, points int) error` — one transaction: insert ledger row + upsert balance (`points` and `lifetime_points` both += points).
  - `Balance(ctx, userID int64) (points, lifetime int, err error)` — zero values if no row.
  - `ListActiveLevels(ctx) ([]Level, error)` and `ListAllLevels(ctx) ([]Level, error)`.
  - `Transactions(ctx, userID int64, limit, offset int) ([]Transaction, int, error)`.

- [ ] **Step 1: Write `repo.go` (this task's methods only)**

```go
package rewards

import (
	"context"
	"database/sql"
	"errors"
)

type Repo struct{ db *sql.DB }

func NewRepo(db *sql.DB) *Repo { return &Repo{db: db} }

func (r *Repo) RuleByType(ctx context.Context, eventType string) (*Rule, error) {
	var ru Rule
	err := r.db.QueryRowContext(ctx,
		`SELECT id, event_type, points, daily_cap, lifetime_cap, is_active, updated_at
		 FROM reward_rules WHERE event_type = ?`, eventType,
	).Scan(&ru.ID, &ru.EventType, &ru.Points, &ru.DailyCap, &ru.LifetimeCap, &ru.IsActive, &ru.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &ru, nil
}

func (r *Repo) CountToday(ctx context.Context, userID int64, eventType string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM reward_transactions
		 WHERE user_id = ? AND event_type = ? AND created_at >= UTC_DATE()`,
		userID, eventType,
	).Scan(&n)
	return n, err
}

func (r *Repo) CountLifetime(ctx context.Context, userID int64, eventType string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM reward_transactions WHERE user_id = ? AND event_type = ?`,
		userID, eventType,
	).Scan(&n)
	return n, err
}

// ApplyAward inserts a positive ledger row and upserts the balance atomically.
func (r *Repo) ApplyAward(ctx context.Context, userID int64, eventType, refType string, refID int64, points int) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var refIDArg any
	if refID != 0 {
		refIDArg = refID
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, eventType, points, refType, refIDArg,
	); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_balances (user_id, points, lifetime_points)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE points = points + VALUES(points),
		                         lifetime_points = lifetime_points + VALUES(lifetime_points)`,
		userID, points, points,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repo) Balance(ctx context.Context, userID int64) (int, int, error) {
	var points, lifetime int
	err := r.db.QueryRowContext(ctx,
		`SELECT points, lifetime_points FROM reward_balances WHERE user_id = ?`, userID,
	).Scan(&points, &lifetime)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, 0, nil
	}
	return points, lifetime, err
}

func (r *Repo) listLevels(ctx context.Context, activeOnly bool) ([]Level, error) {
	q := `SELECT id, name, min_points, icon, color, is_active FROM reward_levels`
	if activeOnly {
		q += ` WHERE is_active = 1`
	}
	q += ` ORDER BY min_points ASC`
	rows, err := r.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Level
	for rows.Next() {
		var l Level
		if err := rows.Scan(&l.ID, &l.Name, &l.MinPoints, &l.Icon, &l.Color, &l.IsActive); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *Repo) ListActiveLevels(ctx context.Context) ([]Level, error) { return r.listLevels(ctx, true) }
func (r *Repo) ListAllLevels(ctx context.Context) ([]Level, error)    { return r.listLevels(ctx, false) }

func (r *Repo) Transactions(ctx context.Context, userID int64, limit, offset int) ([]Transaction, int, error) {
	var total int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM reward_transactions WHERE user_id = ?`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, event_type, points, ref_type, ref_id, note, created_at
		 FROM reward_transactions WHERE user_id = ?
		 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Transaction
	for rows.Next() {
		var t Transaction
		if err := rows.Scan(&t.ID, &t.EventType, &t.Points, &t.RefType, &t.RefID, &t.Note, &t.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}
```

- [ ] **Step 2: Build**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./internal/rewards/...`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add be/internal/rewards/repo.go
git commit -m "feat(rewards): repo — rules, ledger, balances, levels"
```

---

### Task 7: Repository — items, coupon codes, redemptions

**Files:**
- Modify: `be/internal/rewards/repo.go`

**Interfaces:**
- Produces (methods on `*Repo`):
  - `ListItems(ctx, activeOnly bool) ([]Item, error)` — populates `EffectiveStock` (coupon items: count of unclaimed codes; manual: `stock`).
  - `ItemByID(ctx, id int64) (*Item, error)`.
  - `RedeemItem(ctx, userID int64, item *Item, balancePoints int) (*Redemption, error)` — the concurrency-safe transaction: `SELECT ... FOR UPDATE` the balance, verify affordability + stock, deduct via a negative `redemption_spend` ledger row + balance update, claim a coupon code for coupon items (also `FOR UPDATE`), insert the redemption. Returns `ErrInsufficientPoints`/`ErrOutOfStock`/`ErrItemInactive`.
  - `MyRedemptions(ctx, userID int64) ([]Redemption, error)`.
  - `AdminRedemptions(ctx, status string) ([]Redemption, error)`.
  - `ResolveRedemption(ctx, id int64, status, note string) error` — approve = mark resolved; reject = refund via a positive `redemption_refund` ledger row + balance credit, all in one tx; only valid from `pending`.

- [ ] **Step 1: Append the item/redemption methods to `repo.go`**

```go
// ── items ───────────────────────────────────────────────────────────────
func (r *Repo) ListItems(ctx context.Context, activeOnly bool) ([]Item, error) {
	q := `SELECT id, name, description, image_url, points_cost, fulfillment_type, stock, is_active
	      FROM reward_items`
	if activeOnly {
		q += ` WHERE is_active = 1`
	}
	q += ` ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.ImageURL, &it.PointsCost,
			&it.FulfillmentType, &it.Stock, &it.IsActive); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// effective stock
	for i := range out {
		es, err := r.effectiveStock(ctx, &out[i])
		if err != nil {
			return nil, err
		}
		out[i].EffectiveStock = es
	}
	return out, nil
}

func (r *Repo) effectiveStock(ctx context.Context, it *Item) (*int, error) {
	if it.FulfillmentType == "coupon" {
		var n int
		if err := r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reward_coupon_codes WHERE item_id = ? AND redemption_id IS NULL`,
			it.ID).Scan(&n); err != nil {
			return nil, err
		}
		return &n, nil
	}
	return it.Stock, nil // manual: nil = unlimited
}

func (r *Repo) ItemByID(ctx context.Context, id int64) (*Item, error) {
	var it Item
	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, description, image_url, points_cost, fulfillment_type, stock, is_active
		 FROM reward_items WHERE id = ?`, id,
	).Scan(&it.ID, &it.Name, &it.Description, &it.ImageURL, &it.PointsCost, &it.FulfillmentType, &it.Stock, &it.IsActive)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &it, nil
}

// RedeemItem performs the full redemption transaction with row locks.
func (r *Repo) RedeemItem(ctx context.Context, userID int64, item *Item) (*Redemption, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if !item.IsActive {
		return nil, ErrItemInactive
	}

	// lock balance row
	var points int
	err = tx.QueryRowContext(ctx,
		`SELECT points FROM reward_balances WHERE user_id = ? FOR UPDATE`, userID).Scan(&points)
	if errors.Is(err, sql.ErrNoRows) {
		points = 0
	} else if err != nil {
		return nil, err
	}
	if points < item.PointsCost {
		return nil, ErrInsufficientPoints
	}

	// manual stock check
	if item.FulfillmentType == "manual" && item.Stock != nil && *item.Stock <= 0 {
		return nil, ErrOutOfStock
	}

	status := "pending"
	coupon := ""
	var claimedCodeID int64
	if item.FulfillmentType == "coupon" {
		err = tx.QueryRowContext(ctx,
			`SELECT id, code FROM reward_coupon_codes
			 WHERE item_id = ? AND redemption_id IS NULL
			 ORDER BY id LIMIT 1 FOR UPDATE`, item.ID).Scan(&claimedCodeID, &coupon)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrOutOfStock
		}
		if err != nil {
			return nil, err
		}
		status = "fulfilled"
	}

	// deduct: negative ledger row + balance update (upsert to be safe)
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
		 VALUES (?, 'redemption_spend', ?, 'redemption', NULL)`,
		userID, -item.PointsCost); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_balances (user_id, points, lifetime_points) VALUES (?, ?, 0)
		 ON DUPLICATE KEY UPDATE points = points + VALUES(points)`,
		userID, -item.PointsCost); err != nil {
		return nil, err
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_redemptions (user_id, item_id, item_name, points_spent, status, coupon_code, resolved_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		userID, item.ID, item.Name, item.PointsCost, status, coupon,
		sql.NullTime{Time: nowUTC(), Valid: status == "fulfilled"},
	)
	if err != nil {
		return nil, err
	}
	redemptionID, _ := res.LastInsertId()

	// update the spend ledger row ref_id + claim code + decrement manual stock
	if _, err := tx.ExecContext(ctx,
		`UPDATE reward_transactions SET ref_id = ?
		 WHERE user_id = ? AND event_type = 'redemption_spend' AND ref_id IS NULL
		 ORDER BY id DESC LIMIT 1`, redemptionID, userID); err != nil {
		return nil, err
	}
	if item.FulfillmentType == "coupon" {
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_coupon_codes SET redemption_id = ? WHERE id = ?`,
			redemptionID, claimedCodeID); err != nil {
			return nil, err
		}
	} else if item.Stock != nil {
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_items SET stock = stock - 1 WHERE id = ? AND stock > 0`, item.ID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Redemption{
		ID: redemptionID, UserID: userID, ItemID: &item.ID, ItemName: item.Name,
		PointsSpent: item.PointsCost, Status: status, CouponCode: coupon,
	}, nil
}

func (r *Repo) scanRedemptions(rows *sql.Rows, withEmail bool) ([]Redemption, error) {
	defer rows.Close()
	var out []Redemption
	for rows.Next() {
		var rd Redemption
		var dests = []any{&rd.ID, &rd.UserID, &rd.ItemID, &rd.ItemName, &rd.PointsSpent,
			&rd.Status, &rd.CouponCode, &rd.AdminNote, &rd.CreatedAt, &rd.ResolvedAt}
		if withEmail {
			dests = append(dests, &rd.UserEmail)
		}
		if err := rows.Scan(dests...); err != nil {
			return nil, err
		}
		out = append(out, rd)
	}
	return out, rows.Err()
}

func (r *Repo) MyRedemptions(ctx context.Context, userID int64) ([]Redemption, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id, item_id, item_name, points_spent, status, coupon_code, admin_note, created_at, resolved_at
		 FROM reward_redemptions WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	return r.scanRedemptions(rows, false)
}

func (r *Repo) AdminRedemptions(ctx context.Context, status string) ([]Redemption, error) {
	q := `SELECT rr.id, rr.user_id, rr.item_id, rr.item_name, rr.points_spent, rr.status,
	             rr.coupon_code, rr.admin_note, rr.created_at, rr.resolved_at, COALESCE(u.email,'')
	      FROM reward_redemptions rr LEFT JOIN users u ON rr.user_id = u.id`
	var args []any
	if status != "" {
		q += ` WHERE rr.status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY rr.created_at DESC`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	return r.scanRedemptions(rows, true)
}

// ResolveRedemption approves or rejects a pending manual redemption.
func (r *Repo) ResolveRedemption(ctx context.Context, id int64, status, note string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var userID, pointsSpent int64
	var cur string
	err = tx.QueryRowContext(ctx,
		`SELECT user_id, points_spent, status FROM reward_redemptions WHERE id = ? FOR UPDATE`, id).
		Scan(&userID, &pointsSpent, &cur)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if cur != "pending" {
		return ErrValidation
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE reward_redemptions SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?`,
		status, note, nowUTC(), id); err != nil {
		return err
	}
	if status == "rejected" {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
			 VALUES (?, 'redemption_refund', ?, 'redemption', ?)`,
			userID, pointsSpent, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_balances SET points = points + ? WHERE user_id = ?`,
			pointsSpent, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
```

- [ ] **Step 2: Add the `nowUTC` helper at the top of `repo.go`** (after imports):

```go
func nowUTC() time.Time { return time.Now().UTC() }
```
Add `"time"` to the import block.

- [ ] **Step 3: Build**

Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./internal/rewards/...`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add be/internal/rewards/repo.go
git commit -m "feat(rewards): repo — items, coupon codes, redemptions"
```

---

### Task 8: Repository — campaigns, goals, progress + windowed points

**Files:**
- Modify: `be/internal/rewards/repo.go`

**Interfaces:**
- Produces (methods on `*Repo`):
  - `ActiveCampaigns(ctx, now time.Time) ([]Campaign, error)` — active + `now` within window, goals eager-loaded ascending `sort_order`.
  - `CampaignByID(ctx, id int64) (*Campaign, error)` — goals eager-loaded.
  - `AllCampaigns(ctx) ([]Campaign, error)` — admin list (no goals; goals fetched on detail).
  - `WindowPoints(ctx, userID int64, start, end time.Time) (int, error)` — sum of positive `points` in `reward_transactions` for the user with `created_at` in `[start,end]`, excluding `redemption_spend`, `redemption_refund`, `campaign_reward`.
  - `Progress(ctx, campaignID, userID int64) (*CampaignProgress, error)` — nil (not error) if no row.
  - `GrantCampaignGoal(ctx, userID int64, camp *Campaign, goal *CampaignGoal) (*Redemption, error)` — one tx: upsert progress → `redeemed`, credit `reward_points` via a positive `campaign_reward` ledger row + balance (points + lifetime), and if `RewardItemID` set, grant that item (coupon → claim code + `fulfilled`; manual → `pending` redemption). Returns any item redemption (or nil).
  - Admin CRUD: `CreateCampaign`, `UpdateCampaign`, `DeleteCampaign`, `CreateGoal`, `UpdateGoal`, `DeleteGoal`, `CampaignParticipants(ctx, campaignID) ([]CampaignProgress + email, error)`.

- [ ] **Step 1: Append campaign methods to `repo.go`**

```go
// ── campaigns ───────────────────────────────────────────────────────────
func (r *Repo) scanCampaigns(rows *sql.Rows) ([]Campaign, error) {
	defer rows.Close()
	var out []Campaign
	for rows.Next() {
		var c Campaign
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.ImageURL,
			&c.StartsAt, &c.EndsAt, &c.IsActive, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repo) goalsFor(ctx context.Context, campaignID int64) ([]CampaignGoal, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, campaign_id, name, threshold_points, sort_order, reward_points, reward_item_id
		 FROM reward_campaign_goals WHERE campaign_id = ? ORDER BY sort_order ASC, threshold_points ASC`,
		campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CampaignGoal
	for rows.Next() {
		var g CampaignGoal
		if err := rows.Scan(&g.ID, &g.CampaignID, &g.Name, &g.ThresholdPoints, &g.SortOrder,
			&g.RewardPoints, &g.RewardItemID); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *Repo) ActiveCampaigns(ctx context.Context, now time.Time) ([]Campaign, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ?
		 ORDER BY ends_at ASC`, now, now)
	if err != nil {
		return nil, err
	}
	camps, err := r.scanCampaigns(rows)
	if err != nil {
		return nil, err
	}
	for i := range camps {
		g, err := r.goalsFor(ctx, camps[i].ID)
		if err != nil {
			return nil, err
		}
		camps[i].Goals = g
	}
	return camps, nil
}

func (r *Repo) AllCampaigns(ctx context.Context) ([]Campaign, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	return r.scanCampaigns(rows)
}

func (r *Repo) CampaignByID(ctx context.Context, id int64) (*Campaign, error) {
	var c Campaign
	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.Description, &c.ImageURL, &c.StartsAt, &c.EndsAt, &c.IsActive, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	g, err := r.goalsFor(ctx, id)
	if err != nil {
		return nil, err
	}
	c.Goals = g
	return &c, nil
}

func (r *Repo) WindowPoints(ctx context.Context, userID int64, start, end time.Time) (int, error) {
	var sum sql.NullInt64
	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(points),0) FROM reward_transactions
		 WHERE user_id = ? AND points > 0 AND created_at BETWEEN ? AND ?
		   AND event_type NOT IN ('redemption_spend','redemption_refund','campaign_reward')`,
		userID, start, end).Scan(&sum)
	return int(sum.Int64), err
}

func (r *Repo) Progress(ctx context.Context, campaignID, userID int64) (*CampaignProgress, error) {
	var pr CampaignProgress
	err := r.db.QueryRowContext(ctx,
		`SELECT campaign_id, user_id, redeemed_goal_id, status, redeemed_at
		 FROM reward_campaign_progress WHERE campaign_id = ? AND user_id = ?`, campaignID, userID).
		Scan(&pr.CampaignID, &pr.UserID, &pr.RedeemedGoalID, &pr.Status, &pr.RedeemedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &pr, nil
}

// GrantCampaignGoal marks progress redeemed and grants the goal's reward.
func (r *Repo) GrantCampaignGoal(ctx context.Context, userID int64, camp *Campaign, goal *CampaignGoal) (*Redemption, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// idempotency guard: lock/insert progress; fail if already redeemed
	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_campaign_progress (campaign_id, user_id, redeemed_goal_id, status, redeemed_at)
		 VALUES (?, ?, ?, 'redeemed', ?)
		 ON DUPLICATE KEY UPDATE
		   redeemed_goal_id = IF(status = 'redeemed', redeemed_goal_id, VALUES(redeemed_goal_id)),
		   status = IF(status = 'redeemed', status, 'redeemed'),
		   redeemed_at = IF(status = 'redeemed', redeemed_at, VALUES(redeemed_at))`,
		camp.ID, userID, goal.ID, nowUTC())
	if err != nil {
		return nil, err
	}
	// RowsAffected: 1 = inserted, 2 = updated, 0 = no-op (already redeemed same values)
	if aff, _ := res.RowsAffected(); aff == 0 {
		return nil, ErrAlreadyRedeemed
	}
	// re-read to confirm we own the redemption (guards against concurrent redeem)
	var status string
	var redeemedGoal sql.NullInt64
	if err := tx.QueryRowContext(ctx,
		`SELECT status, redeemed_goal_id FROM reward_campaign_progress
		 WHERE campaign_id = ? AND user_id = ? FOR UPDATE`, camp.ID, userID).
		Scan(&status, &redeemedGoal); err != nil {
		return nil, err
	}
	if !redeemedGoal.Valid || redeemedGoal.Int64 != goal.ID {
		return nil, ErrAlreadyRedeemed
	}

	// credit reward points
	if goal.RewardPoints > 0 {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id, note)
			 VALUES (?, 'campaign_reward', ?, 'campaign', ?, ?)`,
			userID, goal.RewardPoints, camp.ID, camp.Name); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO reward_balances (user_id, points, lifetime_points) VALUES (?, ?, ?)
			 ON DUPLICATE KEY UPDATE points = points + VALUES(points),
			                         lifetime_points = lifetime_points + VALUES(lifetime_points)`,
			userID, goal.RewardPoints, goal.RewardPoints); err != nil {
			return nil, err
		}
	}

	var itemRedemption *Redemption
	if goal.RewardItemID != nil {
		ir, err := r.grantItemTx(ctx, tx, userID, *goal.RewardItemID)
		if err != nil {
			return nil, err
		}
		itemRedemption = ir
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return itemRedemption, nil
}

// grantItemTx grants a catalog item as a campaign reward (no points deducted).
func (r *Repo) grantItemTx(ctx context.Context, tx *sql.Tx, userID, itemID int64) (*Redemption, error) {
	var it Item
	err := tx.QueryRowContext(ctx,
		`SELECT id, name, fulfillment_type, stock, is_active FROM reward_items WHERE id = ?`, itemID).
		Scan(&it.ID, &it.Name, &it.FulfillmentType, &it.Stock, &it.IsActive)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil // item deleted → skip silently
	}
	if err != nil {
		return nil, err
	}
	status, coupon := "pending", ""
	var codeID int64
	if it.FulfillmentType == "coupon" {
		err = tx.QueryRowContext(ctx,
			`SELECT id, code FROM reward_coupon_codes WHERE item_id = ? AND redemption_id IS NULL
			 ORDER BY id LIMIT 1 FOR UPDATE`, it.ID).Scan(&codeID, &coupon)
		if errors.Is(err, sql.ErrNoRows) {
			status = "pending" // no codes left → fall back to manual pending
		} else if err != nil {
			return nil, err
		} else {
			status = "fulfilled"
		}
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_redemptions (user_id, item_id, item_name, points_spent, status, coupon_code, resolved_at)
		 VALUES (?, ?, ?, 0, ?, ?, ?)`,
		userID, it.ID, it.Name, status, coupon,
		sql.NullTime{Time: nowUTC(), Valid: status == "fulfilled"})
	if err != nil {
		return nil, err
	}
	rid, _ := res.LastInsertId()
	if status == "fulfilled" && codeID != 0 {
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_coupon_codes SET redemption_id = ? WHERE id = ?`, rid, codeID); err != nil {
			return nil, err
		}
	}
	return &Redemption{ID: rid, UserID: userID, ItemID: &it.ID, ItemName: it.Name,
		Status: status, CouponCode: coupon}, nil
}
```

- [ ] **Step 2: Append admin CRUD methods** (campaigns, goals, participants) to `repo.go`:

```go
func (r *Repo) CreateCampaign(ctx context.Context, c *Campaign) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_campaigns (name, description, image_url, starts_at, ends_at, is_active)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		c.Name, c.Description, c.ImageURL, c.StartsAt, c.EndsAt, c.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateCampaign(ctx context.Context, c *Campaign) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_campaigns SET name=?, description=?, image_url=?, starts_at=?, ends_at=?, is_active=? WHERE id=?`,
		c.Name, c.Description, c.ImageURL, c.StartsAt, c.EndsAt, c.IsActive, c.ID)
	return err
}

func (r *Repo) DeleteCampaign(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_campaigns WHERE id = ?`, id)
	return err
}

func (r *Repo) CreateGoal(ctx context.Context, g *CampaignGoal) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_campaign_goals (campaign_id, name, threshold_points, sort_order, reward_points, reward_item_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		g.CampaignID, g.Name, g.ThresholdPoints, g.SortOrder, g.RewardPoints, g.RewardItemID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateGoal(ctx context.Context, g *CampaignGoal) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_campaign_goals SET name=?, threshold_points=?, sort_order=?, reward_points=?, reward_item_id=? WHERE id=?`,
		g.Name, g.ThresholdPoints, g.SortOrder, g.RewardPoints, g.RewardItemID, g.ID)
	return err
}

func (r *Repo) DeleteGoal(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_campaign_goals WHERE id = ?`, id)
	return err
}

type Participant struct {
	CampaignProgress
	Email string `json:"email"`
}

func (r *Repo) CampaignParticipants(ctx context.Context, campaignID int64) ([]Participant, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT p.campaign_id, p.user_id, p.redeemed_goal_id, p.status, p.redeemed_at, COALESCE(u.email,'')
		 FROM reward_campaign_progress p LEFT JOIN users u ON p.user_id = u.id
		 WHERE p.campaign_id = ? ORDER BY p.updated_at DESC`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Participant
	for rows.Next() {
		var pt Participant
		if err := rows.Scan(&pt.CampaignID, &pt.UserID, &pt.RedeemedGoalID, &pt.Status, &pt.RedeemedAt, &pt.Email); err != nil {
			return nil, err
		}
		out = append(out, pt)
	}
	return out, rows.Err()
}
```

- [ ] **Step 3: Build.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./internal/rewards/...` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add be/internal/rewards/repo.go
git commit -m "feat(rewards): repo — campaigns, goals, progress, windowed points"
```

---

### Task 9: Repository — admin rule/level/item/code CRUD + LevelsForUsers

**Files:**
- Modify: `be/internal/rewards/repo.go`

**Interfaces:**
- Produces (methods on `*Repo`):
  - `AllRules(ctx) ([]Rule, error)`, `CreateRule`, `UpdateRule(ctx, *Rule)`.
  - `CreateLevel`, `UpdateLevel`, `DeleteLevel`.
  - `CreateItem`, `UpdateItem`, `DeleteItem`, `AddCouponCodes(ctx, itemID int64, codes []string) (int, error)`.
  - `LevelsForUsers(ctx, userIDs []int64) (map[int64]Level, error)` — each user's current level from `lifetime_points` (single query joining balances; computed with `LevelFor`).

- [ ] **Step 1: Append these methods** (straightforward INSERT/UPDATE/DELETE mirroring the patterns above; full code):

```go
func (r *Repo) AllRules(ctx context.Context) ([]Rule, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, event_type, points, daily_cap, lifetime_cap, is_active, updated_at
		 FROM reward_rules ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Rule
	for rows.Next() {
		var ru Rule
		if err := rows.Scan(&ru.ID, &ru.EventType, &ru.Points, &ru.DailyCap, &ru.LifetimeCap, &ru.IsActive, &ru.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, ru)
	}
	return out, rows.Err()
}

func (r *Repo) CreateRule(ctx context.Context, ru *Rule) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_rules (event_type, points, daily_cap, lifetime_cap, is_active) VALUES (?, ?, ?, ?, ?)`,
		ru.EventType, ru.Points, ru.DailyCap, ru.LifetimeCap, ru.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateRule(ctx context.Context, ru *Rule) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_rules SET points=?, daily_cap=?, lifetime_cap=?, is_active=? WHERE id=?`,
		ru.Points, ru.DailyCap, ru.LifetimeCap, ru.IsActive, ru.ID)
	return err
}

func (r *Repo) CreateLevel(ctx context.Context, l *Level) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_levels (name, min_points, icon, color, is_active) VALUES (?, ?, ?, ?, ?)`,
		l.Name, l.MinPoints, l.Icon, l.Color, l.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateLevel(ctx context.Context, l *Level) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_levels SET name=?, min_points=?, icon=?, color=?, is_active=? WHERE id=?`,
		l.Name, l.MinPoints, l.Icon, l.Color, l.IsActive, l.ID)
	return err
}

func (r *Repo) DeleteLevel(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_levels WHERE id = ?`, id)
	return err
}

func (r *Repo) CreateItem(ctx context.Context, it *Item) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_items (name, description, image_url, points_cost, fulfillment_type, stock, is_active)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		it.Name, it.Description, it.ImageURL, it.PointsCost, it.FulfillmentType, it.Stock, it.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateItem(ctx context.Context, it *Item) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_items SET name=?, description=?, image_url=?, points_cost=?, fulfillment_type=?, stock=?, is_active=? WHERE id=?`,
		it.Name, it.Description, it.ImageURL, it.PointsCost, it.FulfillmentType, it.Stock, it.IsActive, it.ID)
	return err
}

func (r *Repo) DeleteItem(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_items WHERE id = ?`, id)
	return err
}

func (r *Repo) AddCouponCodes(ctx context.Context, itemID int64, codes []string) (int, error) {
	n := 0
	for _, code := range codes {
		if code == "" {
			continue
		}
		if _, err := r.db.ExecContext(ctx,
			`INSERT INTO reward_coupon_codes (item_id, code) VALUES (?, ?)`, itemID, code); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// LevelsForUsers returns each user's current level (from lifetime_points).
// Users with no balance row or below the lowest level are absent from the map.
func (r *Repo) LevelsForUsers(ctx context.Context, userIDs []int64) (map[int64]Level, error) {
	out := map[int64]Level{}
	if len(userIDs) == 0 {
		return out, nil
	}
	levels, err := r.ListActiveLevels(ctx)
	if err != nil || len(levels) == 0 {
		return out, err
	}
	// build IN clause
	placeholders := make([]string, len(userIDs))
	args := make([]any, len(userIDs))
	for i, id := range userIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	q := `SELECT user_id, lifetime_points FROM reward_balances WHERE user_id IN (` +
		joinComma(placeholders) + `)`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid int64
		var lifetime int
		if err := rows.Scan(&uid, &lifetime); err != nil {
			return nil, err
		}
		if l := LevelFor(levels, lifetime); l != nil {
			out[uid] = *l
		}
	}
	return out, rows.Err()
}

func joinComma(s []string) string {
	res := ""
	for i, v := range s {
		if i > 0 {
			res += ","
		}
		res += v
	}
	return res
}
```

- [ ] **Step 2: Build.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./internal/rewards/...` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add be/internal/rewards/repo.go
git commit -m "feat(rewards): repo — admin CRUD and LevelsForUsers"
```

---

### Task 10: Service layer

**Files:**
- Create: `be/internal/rewards/service.go`

**Interfaces:**
- Consumes: `*Repo` and the pure logic functions.
- Produces (methods on `*Service`, `NewService(db *sql.DB) *Service`):
  - `Award(ctx, userID int64, eventType, refType string, refID int64) error` — load rule; no-op if unknown/inactive; check caps via `CountToday`/`CountLifetime` + `CapReached`; else `ApplyAward`.
  - `Me(ctx, userID) (*MeView, error)`, `History`, `Levels`, `Items`, `Redeem`, `MyRedemptions`.
  - `Campaigns(ctx, userID) ([]CampaignView, error)`, `RedeemCampaignGoal(ctx, userID, campaignID, goalID) (*Redemption, error)`.
  - `LevelsForUsers(ctx, userIDs) (map[int64]Level, error)` (delegates).
  - `Badge(l *Level) *Badge` helper and all admin passthroughs used by handlers.

- [ ] **Step 1: Write `service.go`**

```go
package rewards

import (
	"context"
	"database/sql"
	"time"
)

type Service struct {
	repo *Repo
	db   *sql.DB
}

func NewService(db *sql.DB) *Service { return &Service{repo: NewRepo(db), db: db} }

// Award grants points for an event. Silent no-op on unknown/inactive rule or
// when a cap is reached. Never returns an error the caller should treat as fatal.
func (s *Service) Award(ctx context.Context, userID int64, eventType, refType string, refID int64) error {
	rule, err := s.repo.RuleByType(ctx, eventType)
	if err == ErrNotFound || (rule != nil && !rule.IsActive) {
		return nil
	}
	if err != nil {
		return err
	}
	if rule.DailyCap != nil {
		today, err := s.repo.CountToday(ctx, userID, eventType)
		if err != nil {
			return err
		}
		if CapReached(Rule{DailyCap: rule.DailyCap}, today, 0) {
			return nil
		}
	}
	if rule.LifetimeCap != nil {
		life, err := s.repo.CountLifetime(ctx, userID, eventType)
		if err != nil {
			return err
		}
		if CapReached(Rule{LifetimeCap: rule.LifetimeCap}, 0, life) {
			return nil
		}
	}
	if rule.Points == 0 {
		return nil
	}
	return s.repo.ApplyAward(ctx, userID, eventType, refType, refID, rule.Points)
}

func (s *Service) Me(ctx context.Context, userID int64) (*MeView, error) {
	points, lifetime, err := s.repo.Balance(ctx, userID)
	if err != nil {
		return nil, err
	}
	levels, err := s.repo.ListActiveLevels(ctx)
	if err != nil {
		return nil, err
	}
	next, need := NextLevel(levels, lifetime)
	return &MeView{
		Points: points, LifetimePoints: lifetime,
		CurrentLevel: LevelFor(levels, lifetime), NextLevel: next, PointsToNext: need,
	}, nil
}

func (s *Service) History(ctx context.Context, userID int64, limit, offset int) ([]Transaction, int, error) {
	return s.repo.Transactions(ctx, userID, limit, offset)
}

func (s *Service) Levels(ctx context.Context) ([]Level, error) { return s.repo.ListActiveLevels(ctx) }

func (s *Service) Items(ctx context.Context, userID int64) ([]Item, error) {
	items, err := s.repo.ListItems(ctx, true)
	if err != nil {
		return nil, err
	}
	points, _, err := s.repo.Balance(ctx, userID)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].CanAfford = points >= items[i].PointsCost
	}
	return items, nil
}

func (s *Service) Redeem(ctx context.Context, userID, itemID int64) (*Redemption, error) {
	item, err := s.repo.ItemByID(ctx, itemID)
	if err != nil {
		return nil, err
	}
	return s.repo.RedeemItem(ctx, userID, item)
}

func (s *Service) MyRedemptions(ctx context.Context, userID int64) ([]Redemption, error) {
	return s.repo.MyRedemptions(ctx, userID)
}

func (s *Service) Campaigns(ctx context.Context, userID int64) ([]CampaignView, error) {
	now := time.Now().UTC()
	camps, err := s.repo.ActiveCampaigns(ctx, now)
	if err != nil {
		return nil, err
	}
	out := make([]CampaignView, 0, len(camps))
	for i := range camps {
		c := camps[i]
		pts, err := s.repo.WindowPoints(ctx, userID, c.StartsAt, c.EndsAt)
		if err != nil {
			return nil, err
		}
		prog, err := s.repo.Progress(ctx, c.ID, userID)
		if err != nil {
			return nil, err
		}
		v := CampaignView{Campaign: c, MyPoints: pts, MyStatus: "active",
			AchievedGoalIDs: AchievedGoalIDs(c.Goals, pts)}
		if prog != nil {
			v.RedeemedGoalID = prog.RedeemedGoalID
			v.MyStatus = prog.Status
		}
		out = append(out, v)
	}
	return out, nil
}

func (s *Service) RedeemCampaignGoal(ctx context.Context, userID, campaignID, goalID int64) (*Redemption, error) {
	camp, err := s.repo.CampaignByID(ctx, campaignID)
	if err != nil {
		return nil, err
	}
	pts, err := s.repo.WindowPoints(ctx, userID, camp.StartsAt, camp.EndsAt)
	if err != nil {
		return nil, err
	}
	prog, err := s.repo.Progress(ctx, campaignID, userID)
	if err != nil {
		return nil, err
	}
	if err := ValidateRedeem(*camp, camp.Goals, prog, goalID, pts, time.Now().UTC()); err != nil {
		return nil, err
	}
	var goal *CampaignGoal
	for i := range camp.Goals {
		if camp.Goals[i].ID == goalID {
			goal = &camp.Goals[i]
		}
	}
	return s.repo.GrantCampaignGoal(ctx, userID, camp, goal)
}

func (s *Service) LevelsForUsers(ctx context.Context, userIDs []int64) (map[int64]Level, error) {
	return s.repo.LevelsForUsers(ctx, userIDs)
}

func BadgeOf(l *Level) *Badge {
	if l == nil {
		return nil
	}
	return &Badge{Name: l.Name, Icon: l.Icon, Color: l.Color}
}

// Admin passthroughs
func (s *Service) AdminRules(ctx context.Context) ([]Rule, error)          { return s.repo.AllRules(ctx) }
func (s *Service) AdminCreateRule(ctx context.Context, r *Rule) (int64, error) { return s.repo.CreateRule(ctx, r) }
func (s *Service) AdminUpdateRule(ctx context.Context, r *Rule) error      { return s.repo.UpdateRule(ctx, r) }
func (s *Service) AdminLevels(ctx context.Context) ([]Level, error)        { return s.repo.ListAllLevels(ctx) }
func (s *Service) AdminCreateLevel(ctx context.Context, l *Level) (int64, error) { return s.repo.CreateLevel(ctx, l) }
func (s *Service) AdminUpdateLevel(ctx context.Context, l *Level) error    { return s.repo.UpdateLevel(ctx, l) }
func (s *Service) AdminDeleteLevel(ctx context.Context, id int64) error    { return s.repo.DeleteLevel(ctx, id) }
func (s *Service) AdminItems(ctx context.Context) ([]Item, error)          { return s.repo.ListItems(ctx, false) }
func (s *Service) AdminCreateItem(ctx context.Context, it *Item) (int64, error) { return s.repo.CreateItem(ctx, it) }
func (s *Service) AdminUpdateItem(ctx context.Context, it *Item) error     { return s.repo.UpdateItem(ctx, it) }
func (s *Service) AdminDeleteItem(ctx context.Context, id int64) error     { return s.repo.DeleteItem(ctx, id) }
func (s *Service) AdminAddCodes(ctx context.Context, itemID int64, codes []string) (int, error) { return s.repo.AddCouponCodes(ctx, itemID, codes) }
func (s *Service) AdminRedemptions(ctx context.Context, status string) ([]Redemption, error) { return s.repo.AdminRedemptions(ctx, status) }
func (s *Service) AdminResolveRedemption(ctx context.Context, id int64, status, note string) error { return s.repo.ResolveRedemption(ctx, id, status, note) }
func (s *Service) AdminCampaigns(ctx context.Context) ([]Campaign, error)  { return s.repo.AllCampaigns(ctx) }
func (s *Service) AdminCampaign(ctx context.Context, id int64) (*Campaign, error) { return s.repo.CampaignByID(ctx, id) }
func (s *Service) AdminCreateCampaign(ctx context.Context, c *Campaign) (int64, error) { return s.repo.CreateCampaign(ctx, c) }
func (s *Service) AdminUpdateCampaign(ctx context.Context, c *Campaign) error { return s.repo.UpdateCampaign(ctx, c) }
func (s *Service) AdminDeleteCampaign(ctx context.Context, id int64) error { return s.repo.DeleteCampaign(ctx, id) }
func (s *Service) AdminCreateGoal(ctx context.Context, g *CampaignGoal) (int64, error) { return s.repo.CreateGoal(ctx, g) }
func (s *Service) AdminUpdateGoal(ctx context.Context, g *CampaignGoal) error { return s.repo.UpdateGoal(ctx, g) }
func (s *Service) AdminDeleteGoal(ctx context.Context, id int64) error     { return s.repo.DeleteGoal(ctx, id) }
func (s *Service) AdminParticipants(ctx context.Context, campaignID int64) ([]Participant, error) { return s.repo.CampaignParticipants(ctx, campaignID) }
```

- [ ] **Step 2: Build + run all rewards tests.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go test ./internal/rewards/... -v` — Expected: PASS (the 4 pure test files pass; package compiles).

- [ ] **Step 3: Commit**

```bash
git add be/internal/rewards/service.go
git commit -m "feat(rewards): service layer"
```

---

### Task 11: HTTP handlers + routes

**Files:**
- Create: `be/internal/rewards/handlers.go`, `be/internal/rewards/routes.go`

**Interfaces:**
- Consumes: `*Service`, `middleware.UserIDFromCtx`.
- Produces: `func RegisterRoutes(r chi.Router, svc *Service, auth, admin func(http.Handler) http.Handler)` — mounts all endpoints from the spec's API tables under the caller's mount point.

- [ ] **Step 1: Write `handlers.go`** (local JSON helpers + one handler per endpoint). Key excerpts — write the full set following this shape:

```go
package rewards

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"final-review/be/internal/middleware"
	"github.com/go-chi/chi/v5"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
func qInt(r *http.Request, k string, def int) int {
	if v, err := strconv.Atoi(r.URL.Query().Get(k)); err == nil {
		return v
	}
	return def
}
func idParam(r *http.Request, k string) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, k), 10, 64)
}

type api struct{ svc *Service }

// ── user ────────────────────────────────────────────────────────────────
func (a *api) me(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	v, err := a.svc.Me(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load rewards")
		return
	}
	writeJSON(w, 200, v)
}

func (a *api) history(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	tx, total, err := a.svc.History(r.Context(), uid, qInt(r, "limit", 20), qInt(r, "offset", 0))
	if err != nil {
		writeErr(w, 500, "failed to load history")
		return
	}
	writeJSON(w, 200, map[string]any{"data": tx, "total": total})
}

func (a *api) levels(w http.ResponseWriter, r *http.Request) {
	ls, err := a.svc.Levels(r.Context())
	if err != nil {
		writeErr(w, 500, "failed to load levels")
		return
	}
	writeJSON(w, 200, map[string]any{"data": ls})
}

func (a *api) items(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	its, err := a.svc.Items(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load catalog")
		return
	}
	writeJSON(w, 200, map[string]any{"data": its})
}

func (a *api) redeem(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	var body struct{ ItemID int64 `json:"item_id"` }
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.ItemID == 0 {
		writeErr(w, 400, "item_id is required")
		return
	}
	rd, err := a.svc.Redeem(r.Context(), uid, body.ItemID)
	switch {
	case errors.Is(err, ErrInsufficientPoints):
		writeErr(w, 400, "insufficient points")
	case errors.Is(err, ErrOutOfStock):
		writeErr(w, 400, "out of stock")
	case errors.Is(err, ErrItemInactive):
		writeErr(w, 400, "item is not available")
	case errors.Is(err, ErrNotFound):
		writeErr(w, 404, "item not found")
	case err != nil:
		writeErr(w, 500, "failed to redeem")
	default:
		writeJSON(w, 201, rd)
	}
}

func (a *api) myRedemptions(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	rs, err := a.svc.MyRedemptions(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load redemptions")
		return
	}
	writeJSON(w, 200, map[string]any{"data": rs})
}

func (a *api) campaigns(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	cs, err := a.svc.Campaigns(r.Context(), uid)
	if err != nil {
		writeErr(w, 500, "failed to load campaigns")
		return
	}
	writeJSON(w, 200, map[string]any{"data": cs})
}

func (a *api) redeemCampaign(w http.ResponseWriter, r *http.Request) {
	uid := middleware.UserIDFromCtx(r.Context())
	cid, err := idParam(r, "id")
	if err != nil {
		writeErr(w, 400, "invalid campaign id")
		return
	}
	var body struct{ GoalID int64 `json:"goal_id"` }
	if json.NewDecoder(r.Body).Decode(&body) != nil || body.GoalID == 0 {
		writeErr(w, 400, "goal_id is required")
		return
	}
	rd, err := a.svc.RedeemCampaignGoal(r.Context(), uid, cid, body.GoalID)
	switch {
	case errors.Is(err, ErrGoalNotAchieved):
		writeErr(w, 400, "goal not yet achieved")
	case errors.Is(err, ErrAlreadyRedeemed):
		writeErr(w, 400, "you already redeemed a goal in this campaign")
	case errors.Is(err, ErrCampaignClosed):
		writeErr(w, 400, "campaign is closed")
	case errors.Is(err, ErrNotFound):
		writeErr(w, 404, "not found")
	case err != nil:
		writeErr(w, 500, "failed to redeem goal")
	default:
		writeJSON(w, 201, map[string]any{"item_redemption": rd})
	}
}
```

Then write the **admin handlers** in the same file — one per admin endpoint. Each decodes into the matching struct, calls the `Admin*` service method, and returns the row (or `{data: ...}` for lists). Validation matches the spec:
- rules: `points >= 0`; caps `nil` or `>= 1`; `event_type` non-empty (trim, lower, slugify — reject empty).
- campaigns: `ends_at > starts_at`.
- goals: `threshold_points > 0`; at least one of `reward_points > 0` or `reward_item_id != nil`.
Return `400` with `ErrValidation` messages. Example admin handler:

```go
func (a *api) adminCreateCampaign(w http.ResponseWriter, r *http.Request) {
	var c Campaign
	if json.NewDecoder(r.Body).Decode(&c) != nil {
		writeErr(w, 400, "invalid body")
		return
	}
	if c.Name == "" || !c.EndsAt.After(c.StartsAt) {
		writeErr(w, 400, "name and ends_at > starts_at required")
		return
	}
	id, err := a.svc.AdminCreateCampaign(r.Context(), &c)
	if err != nil {
		writeErr(w, 500, "failed to create campaign")
		return
	}
	c.ID = id
	writeJSON(w, 201, c)
}
```

(Write the remaining admin handlers: `adminRules`, `adminCreateRule`, `adminUpdateRule`, `adminLevels`, `adminCreateLevel`, `adminUpdateLevel`, `adminDeleteLevel`, `adminItems`, `adminCreateItem`, `adminUpdateItem`, `adminDeleteItem`, `adminAddCodes` (body `{codes: string}` split on `\n`, trim each), `adminRedemptions`, `adminResolveRedemption` (body `{status, admin_note}`, allow only `approved|rejected`), `adminCampaign`, `adminUpdateCampaign`, `adminDeleteCampaign`, `adminCreateGoal`, `adminUpdateGoal`, `adminDeleteGoal`, `adminParticipants`. Each is 8-15 lines mirroring the example. `strings` is imported for the code-splitting; `time` is used by structs decoded from JSON.)

- [ ] **Step 2: Write `routes.go`**

```go
package rewards

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// RegisterRoutes mounts all reward endpoints. auth guards user routes; admin
// guards admin routes. Mount under the host's /api/v1 group.
func RegisterRoutes(r chi.Router, svc *Service, auth, admin func(http.Handler) http.Handler) {
	a := &api{svc: svc}

	// public
	r.Get("/rewards/levels", a.levels)

	// user (JWT)
	r.Group(func(r chi.Router) {
		r.Use(auth)
		r.Get("/rewards/me", a.me)
		r.Get("/rewards/me/transactions", a.history)
		r.Get("/rewards/items", a.items)
		r.Post("/rewards/redeem", a.redeem)
		r.Get("/rewards/me/redemptions", a.myRedemptions)
		r.Get("/rewards/campaigns", a.campaigns)
		r.Post("/rewards/campaigns/{id}/redeem", a.redeemCampaign)
	})

	// admin
	r.Group(func(r chi.Router) {
		r.Use(admin)
		r.Get("/admin/rewards/rules", a.adminRules)
		r.Post("/admin/rewards/rules", a.adminCreateRule)
		r.Put("/admin/rewards/rules/{id}", a.adminUpdateRule)

		r.Get("/admin/rewards/levels", a.adminLevels)
		r.Post("/admin/rewards/levels", a.adminCreateLevel)
		r.Put("/admin/rewards/levels/{id}", a.adminUpdateLevel)
		r.Delete("/admin/rewards/levels/{id}", a.adminDeleteLevel)

		r.Get("/admin/rewards/items", a.adminItems)
		r.Post("/admin/rewards/items", a.adminCreateItem)
		r.Put("/admin/rewards/items/{id}", a.adminUpdateItem)
		r.Delete("/admin/rewards/items/{id}", a.adminDeleteItem)
		r.Post("/admin/rewards/items/{id}/codes", a.adminAddCodes)

		r.Get("/admin/rewards/redemptions", a.adminRedemptions)
		r.Put("/admin/rewards/redemptions/{id}", a.adminResolveRedemption)

		r.Get("/admin/rewards/campaigns", a.adminCampaigns)
		r.Post("/admin/rewards/campaigns", a.adminCreateCampaign)
		r.Get("/admin/rewards/campaigns/{id}", a.adminCampaign)
		r.Put("/admin/rewards/campaigns/{id}", a.adminUpdateCampaign)
		r.Delete("/admin/rewards/campaigns/{id}", a.adminDeleteCampaign)
		r.Post("/admin/rewards/campaigns/{id}/goals", a.adminCreateGoal)
		r.Put("/admin/rewards/campaigns/{id}/goals/{goalId}", a.adminUpdateGoal)
		r.Delete("/admin/rewards/campaigns/{id}/goals/{goalId}", a.adminDeleteGoal)
		r.Get("/admin/rewards/campaigns/{id}/participants", a.adminParticipants)
	})
}
```

- [ ] **Step 3: Build.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./internal/rewards/...` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add be/internal/rewards/handlers.go be/internal/rewards/routes.go
git commit -m "feat(rewards): http handlers and route registration"
```

---

## Phase B — Host integration

### Task 12: Mount routes + build the service in the router

**Files:**
- Modify: `be/internal/router/router.go`

**Interfaces:**
- Consumes: `rewards.NewService`, `rewards.RegisterRoutes`.
- Produces: a `rewardsSvc` variable passed to the 4 handler constructors (Task 13).

- [ ] **Step 1: Construct the service.** After the repositories block (near `embedRepo := ...`), add:

```go
	rewardsSvc := rewards.NewService(db)
```
Add the import `"final-review/be/internal/rewards"`.

- [ ] **Step 2: Mount routes** inside the `/api/v1` route group, at the end of `r.Route("/api/v1", func(r chi.Router) {` body (after the admin group), add:

```go
		rewards.RegisterRoutes(r, rewardsSvc,
			mw.Auth(cfg, rdb),
			mw.Admin(cfg, rdb, userRepo),
		)
```

- [ ] **Step 3: Build the whole backend.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./...` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add be/internal/router/router.go
git commit -m "feat(rewards): mount reward routes in router"
```

---

### Task 13: `Award()` calls at the four interaction points

**Files:**
- Modify: `be/internal/handlers/reviews.go`, `comments.go`, `auth.go`, `profile.go`, and their constructors + `router.go` wiring.

**Interfaces:**
- Consumes: `*rewards.Service` injected into each handler struct.
- Produces: points awarded on review create (+image bonus), comment create, login, profile completion.

- [ ] **Step 1: Inject the service.** Add a `rewards *rewards.Service` field to `ReviewHandler`, `CommentHandler`, `AuthHandler`, `ProfileHandler`, extend each `New…Handler` constructor with a trailing `rw *rewards.Service` param, and update the four call sites in `router.go` to pass `rewardsSvc`. Import `"final-review/be/internal/rewards"` in each handler file.

- [ ] **Step 2: reviews.go** — at the end of `Create`, after `log.Printf("INFO reviewID=%d images saved=%d", reviewID, imageCount)` and before `writeJSON(...)`:

```go
	if err := h.rewards.Award(r.Context(), userID, "review_created", "review", reviewID); err != nil {
		log.Printf("WARN reward review_created userID=%d reviewID=%d: %v", userID, reviewID, err)
	}
	if imageCount > 0 {
		if err := h.rewards.Award(r.Context(), userID, "review_with_image", "review", reviewID); err != nil {
			log.Printf("WARN reward review_with_image userID=%d reviewID=%d: %v", userID, reviewID, err)
		}
	}
```

- [ ] **Step 3: comments.go** — in `Create`, after the successful `h.comments.Create` (before `writeJSON`):

```go
	if err := h.rewards.Award(r.Context(), userID, "comment_created", "comment", comment.ID); err != nil {
		log.Printf("WARN reward comment_created userID=%d commentID=%d: %v", userID, comment.ID, err)
	}
```
Add `"log"` to imports if absent.

- [ ] **Step 4: auth.go** — in both `Login` and `completeSocialLogin`, after the token is issued and before `writeJSON`:

```go
	if err := h.rewards.Award(r.Context(), user.ID, "daily_login", "user", user.ID); err != nil {
		log.Printf("WARN reward daily_login userID=%d: %v", user.ID, err)
	}
```
(The `daily_login` rule's `daily_cap=1` dedupes repeat logins the same day.) Add `"log"` if absent.

- [ ] **Step 5: profile.go** — in `Update`, after a successful update, award only when the profile is fully complete:

```go
	if user != nil && user.Username != "" && user.Bio != "" && user.AvatarURL != "" {
		if err := h.rewards.Award(r.Context(), userID, "profile_completed", "user", userID); err != nil {
			log.Printf("WARN reward profile_completed userID=%d: %v", userID, err)
		}
	}
```
Confirm the returned `user` struct exposes `Username`, `Bio`, `AvatarURL` (check `models.User`); if a field is named differently, use the actual field. Add `"log"` if absent. The rule's `lifetime_cap=1` ensures it's awarded once.

- [ ] **Step 6: Build.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./...` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add be/internal/handlers/reviews.go be/internal/handlers/comments.go be/internal/handlers/auth.go be/internal/handlers/profile.go be/internal/router/router.go
git commit -m "feat(rewards): award points at review/comment/login/profile"
```

---

### Task 14: Author badges on review & comment lists

**Files:**
- Modify: `be/internal/models/models.go`, `be/internal/handlers/reviews.go`, `be/internal/handlers/comments.go` (and product review list handler).

**Interfaces:**
- Consumes: `svc.LevelsForUsers`.
- Produces: `author_badge` field on review and comment responses.

- [ ] **Step 1: Add the badge type + fields in `models.go`:**

```go
type Badge struct {
	Name  string `json:"name"`
	Icon  string `json:"icon"`
	Color string `json:"color"`
}
```
Add to `Review`: `AuthorBadge *Badge `json:"author_badge,omitempty"``.
Add to `Comment`: `AuthorBadge *Badge `json:"author_badge,omitempty"``.

- [ ] **Step 2: Decorate in the review `List` handler.** After fetching `reviews`, collect author IDs, call `LevelsForUsers`, attach:

```go
	ids := make([]int64, 0, len(reviews))
	for _, rv := range reviews {
		if rv.Author != nil {
			ids = append(ids, rv.Author.ID)
		}
	}
	if badges, err := h.rewards.LevelsForUsers(r.Context(), ids); err == nil {
		for _, rv := range reviews {
			if rv.Author != nil {
				if lvl, ok := badges[rv.Author.ID]; ok {
					rv.AuthorBadge = &models.Badge{Name: lvl.Name, Icon: lvl.Icon, Color: lvl.Color}
				}
			}
		}
	}
```
(`reviews` is `[]*models.Review`, so mutating elements works. Import `models` if not already.) Apply the same decoration to `ProductHandler.ListReviews` (inject the rewards service there too, mirroring Task 13 injection).

- [ ] **Step 3: Decorate comment threads.** Find the handler that returns a review's comments (e.g. within `ReviewHandler.GetByID` if it embeds comments, or the dedicated comments list). Apply the same collect→`LevelsForUsers`→attach pattern to set `Comment.AuthorBadge`. If comments are not currently returned as a list anywhere, set the badge on the single created comment in `CommentHandler.Create` for consistency and stop there.

- [ ] **Step 4: Build.** Run: `docker run --rm -v "$PWD":/app -w /app golang:1.22 go build ./...` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add be/internal/models/models.go be/internal/handlers/reviews.go be/internal/handlers/comments.go be/internal/handlers/products.go
git commit -m "feat(rewards): author level badges on review/comment lists"
```

---

### Task 15: Backend end-to-end smoke via Docker Compose

**Files:** none (verification task).

- [ ] **Step 1: Bring up the stack.** From `be/`: `docker compose up --build -d` (starts API + MySQL + Redis; migrations auto-run). Confirm `reward_%` tables exist: `docker compose exec db mysql -uroot finalreview -e "SHOW TABLES LIKE 'reward_%'; SELECT event_type, points FROM reward_rules;"` — Expected: 8 tables, 5 seeded rules.

- [ ] **Step 2: Exercise the API.** Register/login to get a JWT, then:
  - `GET /api/v1/rewards/me` → 200 with zeroed balance.
  - Create a review with an image → `GET /api/v1/rewards/me/transactions` shows `review_created` (+`review_with_image`).
  - `GET /api/v1/rewards/levels` → 200.
  - As admin, `POST /api/v1/admin/rewards/campaigns` then a goal, then as user `GET /api/v1/rewards/campaigns` shows progress.
  Record the commands used. Expected: each returns the documented shape; points accrue.

- [ ] **Step 3: Commit** (if any fixes were needed):

```bash
git commit -am "fix(rewards): backend e2e adjustments" || echo "no changes"
```

---

## Phase C — CMS admin UI

> Mirror existing pages: `cms/src/pages/Embeds.tsx` (status queue + approve/reject dialog), `cms/src/pages/Products.tsx` (create/edit dialog + image upload), `cms/src/pages/Users.tsx` (table + switches). Use `apiFetch<T>(path, options)` from `@/lib/api`, TanStack Query, `sonner` `toast`, and the shadcn components under `@/components/ui`.

### Task 16: CMS API client + types

**Files:**
- Create: `cms/src/lib/rewardsApi.ts`

**Interfaces:**
- Produces: typed wrappers used by every Rewards tab.

- [ ] **Step 1: Write `rewardsApi.ts`** — interfaces mirroring the Go JSON structs (`Rule`, `Level`, `Item`, `Redemption`, `Campaign`, `CampaignGoal`, `Participant`) and functions:

```ts
import { apiFetch } from "@/lib/api";

export interface RewardRule {
  id: number; event_type: string; points: number;
  daily_cap: number | null; lifetime_cap: number | null; is_active: boolean; updated_at: string;
}
export interface RewardLevel {
  id: number; name: string; min_points: number; icon: string; color: string; is_active: boolean;
}
export interface RewardItem {
  id: number; name: string; description: string; image_url: string; points_cost: number;
  fulfillment_type: "coupon" | "manual"; stock: number | null; is_active: boolean; effective_stock?: number | null;
}
export interface RewardRedemption {
  id: number; user_id: number; user_email?: string; item_name: string; points_spent: number;
  status: "pending" | "approved" | "rejected" | "fulfilled"; coupon_code: string; admin_note: string;
  created_at: string; resolved_at: string | null;
}
export interface RewardGoal {
  id: number; campaign_id: number; name: string; threshold_points: number; sort_order: number;
  reward_points: number; reward_item_id: number | null;
}
export interface RewardCampaign {
  id: number; name: string; description: string; image_url: string;
  starts_at: string; ends_at: string; is_active: boolean; created_at: string; goals?: RewardGoal[];
}
export interface CampaignParticipant {
  campaign_id: number; user_id: number; email: string;
  redeemed_goal_id: number | null; status: string; redeemed_at: string | null;
}

const list = <T,>(p: string) => apiFetch<{ data: T[] | null }>(p).then((r) => r.data ?? []);

export const rewardsApi = {
  rules: () => list<RewardRule>("/admin/rewards/rules"),
  createRule: (b: Partial<RewardRule>) => apiFetch("/admin/rewards/rules", { method: "POST", body: JSON.stringify(b) }),
  updateRule: (id: number, b: Partial<RewardRule>) => apiFetch(`/admin/rewards/rules/${id}`, { method: "PUT", body: JSON.stringify(b) }),

  levels: () => list<RewardLevel>("/admin/rewards/levels"),
  createLevel: (b: Partial<RewardLevel>) => apiFetch("/admin/rewards/levels", { method: "POST", body: JSON.stringify(b) }),
  updateLevel: (id: number, b: Partial<RewardLevel>) => apiFetch(`/admin/rewards/levels/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteLevel: (id: number) => apiFetch(`/admin/rewards/levels/${id}`, { method: "DELETE" }),

  items: () => list<RewardItem>("/admin/rewards/items"),
  createItem: (b: Partial<RewardItem>) => apiFetch("/admin/rewards/items", { method: "POST", body: JSON.stringify(b) }),
  updateItem: (id: number, b: Partial<RewardItem>) => apiFetch(`/admin/rewards/items/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteItem: (id: number) => apiFetch(`/admin/rewards/items/${id}`, { method: "DELETE" }),
  addCodes: (id: number, codes: string) => apiFetch(`/admin/rewards/items/${id}/codes`, { method: "POST", body: JSON.stringify({ codes }) }),

  redemptions: (status = "") => list<RewardRedemption>(`/admin/rewards/redemptions${status ? `?status=${status}` : ""}`),
  resolveRedemption: (id: number, status: string, admin_note: string) =>
    apiFetch(`/admin/rewards/redemptions/${id}`, { method: "PUT", body: JSON.stringify({ status, admin_note }) }),

  campaigns: () => list<RewardCampaign>("/admin/rewards/campaigns"),
  campaign: (id: number) => apiFetch<RewardCampaign>(`/admin/rewards/campaigns/${id}`),
  createCampaign: (b: Partial<RewardCampaign>) => apiFetch("/admin/rewards/campaigns", { method: "POST", body: JSON.stringify(b) }),
  updateCampaign: (id: number, b: Partial<RewardCampaign>) => apiFetch(`/admin/rewards/campaigns/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteCampaign: (id: number) => apiFetch(`/admin/rewards/campaigns/${id}`, { method: "DELETE" }),
  createGoal: (cid: number, b: Partial<RewardGoal>) => apiFetch(`/admin/rewards/campaigns/${cid}/goals`, { method: "POST", body: JSON.stringify(b) }),
  updateGoal: (cid: number, gid: number, b: Partial<RewardGoal>) => apiFetch(`/admin/rewards/campaigns/${cid}/goals/${gid}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteGoal: (cid: number, gid: number) => apiFetch(`/admin/rewards/campaigns/${cid}/goals/${gid}`, { method: "DELETE" }),
  participants: (id: number) => list<CampaignParticipant>(`/admin/rewards/campaigns/${id}/participants`),
};
```

- [ ] **Step 2: Typecheck.** Run: `cd cms && npm run build` (or `npx tsc --noEmit`). Expected: no type errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add cms/src/lib/rewardsApi.ts
git commit -m "feat(cms): rewards API client"
```

---

### Task 17: Rewards page shell + nav + route

**Files:**
- Create: `cms/src/pages/Rewards.tsx`
- Modify: `cms/src/App.tsx`, `cms/src/components/Sidebar.tsx`

**Interfaces:**
- Produces: `/rewards` route rendering a 5-tab shell (uses `@/components/ui/tabs`).

- [ ] **Step 1: Add nav item** in `Sidebar.tsx` `NAV` array (import a `Gift` icon from `lucide-react`):

```ts
  { label: "Rewards", icon: Gift, to: "/rewards" },
```

- [ ] **Step 2: Add route** in `App.tsx`: import `Rewards` and add
`<Route path="/rewards" element={<ProtectedRoute><Rewards /></ProtectedRoute>} />`.

- [ ] **Step 3: Write `Rewards.tsx`** with the 5 tabs, each rendering a tab component from Task 18–20:

```tsx
import { Layout } from "@/components/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RulesTab } from "./rewards/RulesTab";
import { LevelsTab } from "./rewards/LevelsTab";
import { CatalogTab } from "./rewards/CatalogTab";
import { RedemptionsTab } from "./rewards/RedemptionsTab";
import { CampaignsTab } from "./rewards/CampaignsTab";

export default function Rewards() {
  return (
    <Layout title="Rewards">
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="levels">Levels</TabsTrigger>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        </TabsList>
        <TabsContent value="rules"><RulesTab /></TabsContent>
        <TabsContent value="levels"><LevelsTab /></TabsContent>
        <TabsContent value="catalog"><CatalogTab /></TabsContent>
        <TabsContent value="redemptions"><RedemptionsTab /></TabsContent>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
      </Tabs>
    </Layout>
  );
}
```

- [ ] **Step 4: Create stub tab files** so the app compiles (each `export function XTab(){ return <div/> }`), then fill them in 18–20. Build: `cd cms && npm run build`. Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add cms/src/pages/Rewards.tsx cms/src/pages/rewards cms/src/App.tsx cms/src/components/Sidebar.tsx
git commit -m "feat(cms): rewards page shell, nav, and route"
```

---

### Task 18: Rules & Levels tabs

**Files:**
- Create: `cms/src/pages/rewards/RulesTab.tsx`, `cms/src/pages/rewards/LevelsTab.tsx`

- [ ] **Step 1: RulesTab** — `useQuery(["reward-rules"], rewardsApi.rules)` renders a table (event_type, points, daily_cap, lifetime_cap, active `Switch`). An "Edit" dialog with number inputs + `Switch`, and an "Add event type" dialog (event_type slug + points + caps) call `createRule`/`updateRule` mutations that `invalidateQueries(["reward-rules"])` and `toast.success`. Mirror the mutation pattern in `Embeds.tsx` lines 60-73.

- [ ] **Step 2: LevelsTab** — `useQuery(["reward-levels"], rewardsApi.levels)` renders tiers sorted by `min_points`; create/edit dialog (name, min_points, icon text, color — a text input accepting a hex like `#f59e0b`, rendered as a swatch); delete with confirm (`@/components/ui/alert-dialog`). Mutations invalidate `["reward-levels"]`.

- [ ] **Step 3: Build.** `cd cms && npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add cms/src/pages/rewards/RulesTab.tsx cms/src/pages/rewards/LevelsTab.tsx
git commit -m "feat(cms): rewards rules and levels tabs"
```

---

### Task 19: Catalog & Redemptions tabs

**Files:**
- Create: `cms/src/pages/rewards/CatalogTab.tsx`, `cms/src/pages/rewards/RedemptionsTab.tsx`

- [ ] **Step 1: CatalogTab** — grid of item cards (`useQuery(["reward-items"], rewardsApi.items)`). Create/edit dialog: name, description, `fulfillment_type` select (`coupon`/`manual`), `points_cost`, `stock` (shown only for manual; coupon stock is derived), image upload via `uploadImage` from `@/lib/api`, active switch. For coupon items, a "Codes" area with a `Textarea` (newline-separated) calling `addCodes`, showing `effective_stock` as "N codes left". Mutations invalidate `["reward-items"]`.

- [ ] **Step 2: RedemptionsTab** — status filter (`""|pending|approved|rejected|fulfilled`) → `useQuery(["reward-redemptions", filter], () => rewardsApi.redemptions(filter))`. Table: user_email, item_name, points_spent, status badge (reuse the `StatusBadge` idea from `Embeds.tsx`), created_at. Pending manual rows get Approve/Reject buttons opening a dialog with an `admin_note` `Textarea` → `resolveRedemption`. On success invalidate `["reward-redemptions"]` and toast.

- [ ] **Step 3: Build.** `cd cms && npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add cms/src/pages/rewards/CatalogTab.tsx cms/src/pages/rewards/RedemptionsTab.tsx
git commit -m "feat(cms): rewards catalog and redemptions tabs"
```

---

### Task 20: Campaigns tab (with goal editor + participants)

**Files:**
- Create: `cms/src/pages/rewards/CampaignsTab.tsx`

- [ ] **Step 1: List + create/edit** — `useQuery(["reward-campaigns"], rewardsApi.campaigns)` renders campaign rows (name, window, active, goal count). Create/edit dialog: name, description, image upload, `starts_at`/`ends_at` (`<input type="datetime-local">`, converted to ISO on submit), active switch. Validate `ends_at > starts_at` client-side. Mutations invalidate `["reward-campaigns"]`.

- [ ] **Step 2: Goal editor** — selecting a campaign opens a detail dialog loading `rewardsApi.campaign(id)`. Lists goals ordered by `sort_order`; each row edits name, `threshold_points`, `reward_points`, optional `reward_item_id` (a select populated from `rewardsApi.items()` filtered to active), `sort_order`. Add/edit via `createGoal`/`updateGoal`, delete via `deleteGoal` with confirm. Client validation: `threshold_points > 0`, and `reward_points > 0 || reward_item_id`. Invalidate `["reward-campaign", id]` after each change.

- [ ] **Step 3: Participants** — a sub-tab or button in the detail dialog loads `rewardsApi.participants(id)` into a table (email, status, redeemed goal name resolved from the campaign's goals, redeemed_at).

- [ ] **Step 4: Build.** `cd cms && npm run build`. Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add cms/src/pages/rewards/CampaignsTab.tsx
git commit -m "feat(cms): rewards campaigns tab with goal editor and participants"
```

---

## Phase D — FE end-user UI

> FE `apiFetch<T>(path, options, token?)` from `@/lib/api`; token comes from the auth session (see `Profile.tsx` for the `token` hook usage). Reuse shadcn components under `fe/src/components/ui` including `progress`, `tabs`, `dialog`, `badge`.

### Task 21: FE API client + LevelBadge component

**Files:**
- Create: `fe/src/lib/rewardsApi.ts`, `fe/src/components/LevelBadge.tsx`

- [ ] **Step 1: `rewardsApi.ts`** — mirror the CMS client's interfaces (reuse `MeView`, `RewardItem`, `RewardRedemption`, `RewardCampaign`, `RewardGoal`, plus `CampaignView` with `my_points`, `achieved_goal_ids`, `redeemed_goal_id`, `my_status`). Each function takes `token: string | null`:

```ts
import { apiFetch } from "@/lib/api";

export interface RewardMe {
  points: number; lifetime_points: number;
  current_level: RewardLevel | null; next_level: RewardLevel | null; points_to_next: number;
}
export interface RewardLevel { id: number; name: string; min_points: number; icon: string; color: string; }
export interface RewardItem {
  id: number; name: string; description: string; image_url: string; points_cost: number;
  fulfillment_type: "coupon" | "manual"; effective_stock: number | null; can_afford: boolean; is_active: boolean;
}
export interface RewardGoal { id: number; name: string; threshold_points: number; reward_points: number; reward_item_id: number | null; }
export interface CampaignView {
  id: number; name: string; description: string; image_url: string; starts_at: string; ends_at: string;
  goals: RewardGoal[]; my_points: number; achieved_goal_ids: number[] | null;
  redeemed_goal_id: number | null; my_status: "active" | "redeemed" | "expired";
}
export interface RewardTx { id: number; event_type: string; points: number; note: string; created_at: string; }
export interface Redemption { id: number; item_name: string; points_spent: number; status: string; coupon_code: string; created_at: string; }

export const rewardsApi = {
  me: (t: string | null) => apiFetch<RewardMe>("/rewards/me", {}, t),
  history: (t: string | null) => apiFetch<{ data: RewardTx[] | null }>("/rewards/me/transactions", {}, t).then(r => r.data ?? []),
  levels: (t: string | null) => apiFetch<{ data: RewardLevel[] | null }>("/rewards/levels", {}, t).then(r => r.data ?? []),
  items: (t: string | null) => apiFetch<{ data: RewardItem[] | null }>("/rewards/items", {}, t).then(r => r.data ?? []),
  redeem: (t: string | null, item_id: number) => apiFetch<Redemption>("/rewards/redeem", { method: "POST", body: JSON.stringify({ item_id }) }, t),
  myRedemptions: (t: string | null) => apiFetch<{ data: Redemption[] | null }>("/rewards/me/redemptions", {}, t).then(r => r.data ?? []),
  campaigns: (t: string | null) => apiFetch<{ data: CampaignView[] | null }>("/rewards/campaigns", {}, t).then(r => r.data ?? []),
  redeemCampaign: (t: string | null, id: number, goal_id: number) =>
    apiFetch<{ item_redemption: Redemption | null }>(`/rewards/campaigns/${id}/redeem`, { method: "POST", body: JSON.stringify({ goal_id }) }, t),
};
```

- [ ] **Step 2: `LevelBadge.tsx`** — a small chip: colored dot/icon + name, styled from `color`:

```tsx
export function LevelBadge({ name, icon, color }: { name: string; icon?: string; color?: string }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: (color || "#64748b") + "22", color: color || "#64748b" }}
    >
      {icon ? <span>{icon}</span> : null}
      {name}
    </span>
  );
}
```

- [ ] **Step 3: Typecheck.** `cd fe && npx tsc --noEmit` (or `npm run build`). Expected: no errors in new files.

- [ ] **Step 4: Commit**

```bash
git add fe/src/lib/rewardsApi.ts fe/src/components/LevelBadge.tsx
git commit -m "feat(fe): rewards API client and LevelBadge"
```

---

### Task 22: `/rewards` page — balance + history + catalog + redemptions

**Files:**
- Create: `fe/src/pages/Rewards.tsx`
- Modify: `fe/src/App.tsx` (route)

- [ ] **Step 1: Route.** In `App.tsx`, import `Rewards` and add `<Route path="/rewards" element={<Rewards />} />`.

- [ ] **Step 2: Page.** Balance card at top (points, lifetime, `LevelBadge` for `current_level`, a `Progress` bar = `lifetime_points`/`next_level.min_points` with "N points to {next_level.name}"). Below, `Tabs`: **History** (list of `history` rows, +/− points, note, date), **Catalog** (grid of `items`; each card shows cost, `effective_stock`, a **Redeem** button disabled unless `can_afford` and in-stock; clicking opens a confirm `Dialog`; on success, coupon items show the returned `coupon_code` in a success dialog), **My Redemptions** (`myRedemptions` list with status). Use the token from the auth session as in `Profile.tsx`. Redeem mutation invalidates `["rewards-me"]`, `["rewards-items"]`, `["rewards-redemptions"]`.

- [ ] **Step 3: Build.** `cd fe && npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add fe/src/pages/Rewards.tsx fe/src/App.tsx
git commit -m "feat(fe): rewards page — balance, history, catalog, redemptions"
```

---

### Task 23: Campaigns tab on `/rewards`

**Files:**
- Modify: `fe/src/pages/Rewards.tsx`

- [ ] **Step 1: Add a Campaigns tab** rendering `campaigns`. For each campaign: name, image, a countdown/label to `ends_at`, `my_points`, and a stepped goal ladder (map `goals` sorted by threshold; mark those in `achieved_goal_ids` as reached; render a `Progress` bar toward the next unreached goal). For each **achieved but not-yet-redeemed** goal (and only if `my_status === "active"`), show two buttons:
  - **Redeem** → confirm `Dialog` warning "This ends your participation in this campaign and forfeits higher goals." → `redeemCampaign(token, campaign.id, goal.id)`; on success show reward (points and/or `item_redemption.coupon_code`), invalidate `["rewards-campaigns"]` + `["rewards-me"]`.
  - **Continue** → closes/dismisses (no API call).
  If `my_status === "redeemed"`, show which goal was redeemed and disable actions.

- [ ] **Step 2: Build.** `cd fe && npm run build`. Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add fe/src/pages/Rewards.tsx
git commit -m "feat(fe): campaigns tab with redeem/continue choice"
```

---

### Task 24: Profile points/badge + author badges on cards

**Files:**
- Modify: `fe/src/pages/Profile.tsx`, review card + comment components.

- [ ] **Step 1: Profile.** Add a query for `rewardsApi.me(token)`; render points total and `LevelBadge` for `current_level` near the profile header. Link to `/rewards`.

- [ ] **Step 2: Author badges.** In the review list/card component and the comment component, read the new `author_badge` field from the API response type (add `author_badge?: { name: string; icon: string; color: string } | null` to the relevant FE types) and render `<LevelBadge {...author_badge} />` beside the author name when present. Grep for where `author`/`username` renders on review cards (e.g. `BrowseReviews.tsx`, `ReviewDetails.tsx`) and add the badge there.

- [ ] **Step 3: Build.** `cd fe && npm run build`. Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add fe/src/pages/Profile.tsx fe/src/pages/BrowseReviews.tsx fe/src/pages/ReviewDetails.tsx
git commit -m "feat(fe): profile rewards summary and author level badges"
```

---

### Task 25: Full manual end-to-end pass

**Files:** none (verification).

- [ ] **Step 1: Run all three apps** against the Docker stack (`be` via `docker compose up`, `cms` and `fe` via `npm run dev`).
- [ ] **Step 2: Walk the spec's manual E2E:** earn via review (with image)/comment/login/profile → see the level badge appear on a review card once a level threshold is crossed (create a low-`min_points` level in CMS to make this quick) → redeem a coupon item and a manual item → approve/reject the manual one in CMS (verify reject refunds points) → create a campaign with two goals in CMS → as the user, reach goal 1, choose **Continue**, reach goal 2, **Redeem** → verify exactly one reward granted and the campaign shows `redeemed`.
- [ ] **Step 3:** Fix any issues found, commit with a descriptive message.

---

## Self-Review (completed by plan author)

**Spec coverage:** rules/points/caps (1,6,10,18) ✓; `review_with_image` bonus (1 seed, 13) ✓; transactions ledger + balances (1,6) ✓; levels computed from lifetime (4,9) ✓; catalog + coupon codes + manual/coupon fulfillment (1,7,19) ✓; redemption state machine incl. reject-refund (7,19) ✓; concurrency `FOR UPDATE` (7,8) ✓; campaigns/goals/progress + windowed points + redeem-one cash-out (1,5,8,10,20,23) ✓; module surface `Award`/`RegisterRoutes`/`LevelsForUsers` (10,11,12) ✓; 4 integration points +image (13) ✓; author_badge on lists (14,24) ✓; full HTTP API (11) ✓; CMS 5 tabs (17–20) ✓; FE rewards page + campaigns + profile + badges (22–24) ✓; testing: pure-logic table-driven tests (3–5) + Docker e2e (15,25) ✓; out-of-scope items intentionally omitted ✓.

**Placeholder scan:** CMS/FE UI tasks (18–20, 22–24) describe components against fully-specified API clients and name the exact existing files to mirror, rather than reproducing every JSX line — this is deliberate given they are thin CRUD/display screens over a fully-typed contract; all data shapes, endpoints, query keys, and validation rules are concrete. Backend tasks contain complete code.

**Type consistency:** `Award(ctx, userID, eventType, refType, refID)`, `LevelsForUsers → map[int64]Level`, `RegisterRoutes(r, svc, auth, admin)`, `CampaignView` fields, and the `{data: [...]}` list envelope are consistent across backend, CMS client, and FE client.

**Testing note:** Go is not installed locally and there is no DB-backed test harness, so automated Go tests cover the **pure decision logic** (caps, levels, campaign state machine) which is where the subtle correctness lives; repository/transaction correctness (concurrency, refunds, windowed sums) is verified via the Docker Compose e2e passes (15, 25). If a MySQL-backed integration test suite is desired, add it as a follow-up task using a `//go:build integration` tag and a compose-provided DB.
