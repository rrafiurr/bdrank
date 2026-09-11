# User Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logged-in users send typed feedback from a `/feedback` page, admins triage it and reply from a CMS inbox, and users read replies on their profile. A reusable Redis rate limiter and server-side content rules keep users from making a mess.

**Architecture:** A new `ratelimit` package runs a sliding-window log in Redis through one atomic Lua script. `middleware.RateLimitPerUser` wraps a route with it and refunds the hit when the handler rejects the request. A pure `feedback` package holds every rule and error code. `FeedbackRepo` stores items in a new `feedback` table (migration 016). `FeedbackHandler` serves the user and admin endpoints. The frontend adds a form page, a profile card, and a header dot. The CMS adds an inbox page.

**Tech Stack:** Go 1.22, chi v5, go-redis v9, MySQL 8.4, React 18 + TypeScript, TanStack Query 5, i18next, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-11-user-feedback-design.md`

## Global Constraints

- **Limits.** Cooldown is 1 per 60 seconds. The daily cap is 5 per rolling 24 hours. Both are enforced in Redis and only successful requests count.
- **Message.** 20–2,000 characters after cleaning, counted in runes. At least 6 distinct non-space characters. At most 2 links.
- **Request body.** At most 16 KB.
- **History checks.**
  - Duplicate: same fingerprint from the same user within 30 days.
  - Open cap: 10 items per user.
  - Spam pause: 3 or more spam-marked items created in the last 30 days.
- **Field sizes.** Page path at most 300 characters. User agent at most 255. Admin reply at most 2,000. `GET /feedback/mine` returns at most 50 items. The admin list defaults to 50 per page, with a maximum of 100.
- **Error body.** Every error is `{"error": "<English sentence>", "code": "<code>"}`, plus `retry_after` (whole seconds) when the code is `rate_limited`. The codes are an API contract: `invalid_body`, `invalid_type`, `message_too_short`, `message_too_long`, `message_low_effort`, `too_many_links`, `paused`, `duplicate`, `too_many_open`, `invalid_status`, `invalid_reply`, `rate_limited`, `rate_limit_unavailable`.
- **User-facing status.** `spam` is shown to users as `closed`.
- **Plain text only.** Feedback text is rendered with React escaping and `whitespace-pre-wrap`. Never use `dangerouslySetInnerHTML`.
- **Translations.** Every user-facing frontend string goes into both `fe/src/locales/en/translation.json` and `fe/src/locales/bn/translation.json`. CMS strings are English only, like the rest of the CMS.
- **No new dependencies.** No new Go modules and no new npm packages.
- **Go runs in Docker.** Go is not installed on the host. Run it with `docker run ... golang:1.22`.
- **Type-check the frontends.** `npm run build` does not type-check. Run `npx tsc --noEmit -p tsconfig.app.json` in `fe/` and in `cms/`. Both are clean today, so they must stay at zero errors.
- **The host is shared.** Never point `REDIS_TEST_ADDR` or `MYSQL_TEST_DSN` at `common-redis-1` or `common-mysql-1`. Use the throwaway containers from Task 1 and Task 4. Never migrate the shared `review-new` database without asking the user first.
- **Never push `main`.** A push is a production deploy. Migrations are applied by hand on the VPS: `016_feedback.sql` must be applied there before any push.
- **Commits.** Every commit message ends with the line `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage explicit paths only: the main checkout has unrelated uncommitted edits (`.claude/settings.json`, `docs/BDRANKS_FEATURES.md`) that must not be swept in.

## Working environment

Work in a git worktree on a branch named `feat/user-feedback`, created with superpowers:using-git-worktrees.

The dev API container `be-api-1` hot-reloads from the **main** checkout, so building in the worktree keeps half-finished code from crashing it.

The first commit on the branch adds this plan and the spec:

```bash
git add docs/superpowers/specs/2026-09-11-user-feedback-design.md docs/superpowers/plans/2026-09-11-user-feedback.md
git commit -m "docs: user feedback design and implementation plan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If the spec and plan exist only as untracked files in the main checkout, copy them into the worktree before committing.

Every `go` command runs from the worktree root, in Docker, and is spelled out in full in each step, because each step may run in a fresh shell. The base command is:

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go <args>
```

`feedback-go-mod` is a module-cache volume of its own. Do not reuse `be_go-mod-cache`, which belongs to the running `be-api-1`. Tests that need Redis or MySQL add `--network container:<name>` so `127.0.0.1` reaches the throwaway container.

## File map

| File | Responsibility |
|---|---|
| `be/internal/ratelimit/ratelimit.go` | Redis sliding-window limiter: `Rule`, `Result`, `Limiter.Allow`, `Limiter.Refund`, `Key` |
| `be/internal/middleware/ratelimit.go` | `RateLimitPerUser` HTTP middleware and the `RateLimiter` interface |
| `be/internal/middleware/auth.go` | gains `WithUserID`, a test helper |
| `be/internal/feedback/feedback.go` | Pure rules: cleaning, validation, fingerprint, admission, rate rules, error codes |
| `be/migrations/016_feedback.sql` | `feedback` table |
| `be/internal/models/feedback.go` | `Feedback`, `AdminFeedback`, `FeedbackUser` |
| `be/internal/repository/feedback.go` | `FeedbackRepo`: SQL for the feedback table |
| `be/internal/handlers/feedback.go` | User endpoints, the store interface, error mapping |
| `be/internal/handlers/feedback_admin.go` | Admin list and update endpoints |
| `be/internal/handlers/response.go` | gains `writeErrorCode` |
| `be/internal/handlers/admin.go` | `Stats` gains `new_feedback` |
| `be/internal/router/router.go` | Wires the limiter, repo, handler, and routes |
| `fe/src/lib/api.ts` | `ApiError` carrying `status`, `code`, `retryAfter` |
| `fe/src/lib/feedbackApi.ts` | Types and API calls |
| `fe/src/lib/feedbackRules.ts` | Client mirror of the content rules |
| `fe/src/lib/feedbackDisplay.ts` | Type icons and status badge classes |
| `fe/src/components/FeedbackForm.tsx` | The form and its thank-you state |
| `fe/src/pages/Feedback.tsx` | `/feedback` page |
| `fe/src/hooks/useFeedbackUnread.ts` | Unread-reply count for the header dot |
| `fe/src/components/MyFeedback.tsx` | Profile "My feedback" card |
| `fe/src/components/Header.tsx`, `Footer.tsx`, `pages/Profile.tsx`, `App.tsx` | Entry points and wiring |
| `cms/src/pages/Feedback.tsx` | Admin inbox |
| `cms/src/lib/api.ts`, `components/Sidebar.tsx`, `components/Layout.tsx`, `App.tsx` | CMS types, nav badge, route |

---

### Task 1: Redis sliding-window rate limiter

**Files:**
- Create: `be/internal/ratelimit/ratelimit.go`
- Test: `be/internal/ratelimit/ratelimit_test.go`

**Interfaces:**
- Consumes: `github.com/redis/go-redis/v9` (already in `go.mod`)
- Produces:
  - `type Rule struct { Name string; Limit int; Window time.Duration }`
  - `type Result struct { Allowed bool; RetryAfter time.Duration; Rule string }`
  - `func New(rdb *redis.Client) *Limiter`
  - `func (l *Limiter) Allow(ctx context.Context, scope, subject string, rules []Rule) (Result, string, error)`, where the string is the hit token and is empty when the request is denied
  - `func (l *Limiter) Refund(ctx context.Context, scope, subject string, rules []Rule, token string) error`
  - `func Key(scope, subject, rule string) string`, which returns `rl:{<scope>:<subject>}:<rule>`

- [ ] **Step 1: Start a throwaway Redis for this and later tasks**

```bash
docker run -d --rm --name fb-redis-test redis:7-alpine
docker exec fb-redis-test redis-cli ping
```
Expected: `PONG`. It is reused by Task 5 and Task 9. Task 9 stops it.

- [ ] **Step 2: Write the failing tests**

Create `be/internal/ratelimit/ratelimit_test.go`:

```go
package ratelimit

import (
	"context"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// These tests need a real Redis, because the Lua script and sorted-set
// semantics are the thing under test. Point REDIS_TEST_ADDR at a THROWAWAY
// instance, never the shared dev Redis. Keys are namespaced per test and
// expire on their own, so nothing is flushed.
func testLimiter(t *testing.T) (*Limiter, string) {
	t.Helper()
	addr := os.Getenv("REDIS_TEST_ADDR")
	if addr == "" {
		t.Skip("REDIS_TEST_ADDR not set; skipping Redis-backed limiter tests")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { rdb.Close() })
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("redis ping %s: %v", addr, err)
	}
	return New(rdb), fmt.Sprintf("test-%s-%d", t.Name(), time.Now().UnixNano())
}

// clock is a settable time source, so tests move time without sleeping.
type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

func startClock(l *Limiter) *clock {
	c := &clock{t: time.UnixMilli(1_700_000_000_000)}
	l.now = c.now
	return c
}

func TestAllowUpToLimitThenDeny(t *testing.T) {
	l, scope := testLimiter(t)
	c := startClock(l)
	ctx := context.Background()
	rules := []Rule{{Name: "daily", Limit: 3, Window: time.Hour}}

	for i := 1; i <= 3; i++ {
		res, token, err := l.Allow(ctx, scope, "u1", rules)
		if err != nil {
			t.Fatal(err)
		}
		if !res.Allowed || token == "" {
			t.Fatalf("hit %d: allowed=%v token=%q, want allowed with a token", i, res.Allowed, token)
		}
		c.add(10 * time.Minute)
	}

	// Hits at +0, +10m and +20m, and it is now +30m. The +0 hit leaves the window at +60m.
	res, token, err := l.Allow(ctx, scope, "u1", rules)
	if err != nil {
		t.Fatal(err)
	}
	if res.Allowed || token != "" {
		t.Fatalf("4th hit: allowed=%v token=%q, want denied without a token", res.Allowed, token)
	}
	if res.RetryAfter != 30*time.Minute {
		t.Errorf("RetryAfter = %v, want 30m", res.RetryAfter)
	}
	if res.Rule != "daily" {
		t.Errorf("Rule = %q, want daily", res.Rule)
	}
}

func TestWindowSlidesOpen(t *testing.T) {
	l, scope := testLimiter(t)
	c := startClock(l)
	ctx := context.Background()
	rules := []Rule{{Name: "cooldown", Limit: 1, Window: time.Minute}}

	if res, _, _ := l.Allow(ctx, scope, "u1", rules); !res.Allowed {
		t.Fatal("first hit denied")
	}
	c.add(59 * time.Second)
	res, _, err := l.Allow(ctx, scope, "u1", rules)
	if err != nil {
		t.Fatal(err)
	}
	if res.Allowed || res.RetryAfter != time.Second {
		t.Fatalf("at +59s: allowed=%v retry=%v, want denied with 1s left", res.Allowed, res.RetryAfter)
	}
	c.add(time.Second)
	if res, _, _ := l.Allow(ctx, scope, "u1", rules); !res.Allowed {
		t.Fatal("at +60s: denied, want allowed once the first hit left the window")
	}
}

func TestSubjectsAreIndependent(t *testing.T) {
	l, scope := testLimiter(t)
	startClock(l)
	ctx := context.Background()
	rules := []Rule{{Name: "cooldown", Limit: 1, Window: time.Minute}}

	l.Allow(ctx, scope, "u1", rules)
	if res, _, _ := l.Allow(ctx, scope, "u1", rules); res.Allowed {
		t.Fatal("u1 second hit allowed, want denied")
	}
	if res, _, _ := l.Allow(ctx, scope, "u2", rules); !res.Allowed {
		t.Fatal("u2 denied because of u1's hits")
	}
}

func TestDeniedRequestRecordsNothing(t *testing.T) {
	l, scope := testLimiter(t)
	c := startClock(l)
	ctx := context.Background()
	rules := []Rule{
		{Name: "cooldown", Limit: 1, Window: time.Minute},
		{Name: "daily", Limit: 5, Window: 24 * time.Hour},
	}

	l.Allow(ctx, scope, "u1", rules)
	res, _, err := l.Allow(ctx, scope, "u1", rules) // same instant, so the cooldown denies
	if err != nil {
		t.Fatal(err)
	}
	if res.Allowed || res.Rule != "cooldown" || res.RetryAfter != time.Minute {
		t.Fatalf("got allowed=%v rule=%q retry=%v, want a cooldown denial of 1m", res.Allowed, res.Rule, res.RetryAfter)
	}
	c.add(time.Minute)
	if res, _, _ := l.Allow(ctx, scope, "u1", rules); !res.Allowed {
		t.Fatal("after the cooldown: denied, want allowed")
	}

	n, err := l.rdb.ZCard(ctx, Key(scope, "u1", "daily")).Result()
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("daily holds %d hits, want 2: the denied request must not use a daily slot", n)
	}
}

func TestLongestWaitWins(t *testing.T) {
	l, scope := testLimiter(t)
	c := startClock(l)
	ctx := context.Background()
	rules := []Rule{
		{Name: "cooldown", Limit: 1, Window: time.Minute},
		{Name: "daily", Limit: 2, Window: 24 * time.Hour},
	}

	l.Allow(ctx, scope, "u1", rules) // +0
	c.add(time.Minute)
	l.Allow(ctx, scope, "u1", rules) // +1m
	c.add(30 * time.Second)          // +1m30s: the cooldown frees in 30s, the daily cap at +24h

	res, _, err := l.Allow(ctx, scope, "u1", rules)
	if err != nil {
		t.Fatal(err)
	}
	want := 24*time.Hour - 90*time.Second
	if res.Allowed || res.Rule != "daily" || res.RetryAfter != want {
		t.Fatalf("got allowed=%v rule=%q retry=%v, want a daily denial of %v", res.Allowed, res.Rule, res.RetryAfter, want)
	}
}

func TestRefundGivesTheSlotBack(t *testing.T) {
	l, scope := testLimiter(t)
	startClock(l)
	ctx := context.Background()
	rules := []Rule{{Name: "cooldown", Limit: 1, Window: time.Hour}}

	_, token, _ := l.Allow(ctx, scope, "u1", rules)
	if res, _, _ := l.Allow(ctx, scope, "u1", rules); res.Allowed {
		t.Fatal("second hit allowed before the refund")
	}
	if err := l.Refund(ctx, scope, "u1", rules, token); err != nil {
		t.Fatal(err)
	}
	if res, _, _ := l.Allow(ctx, scope, "u1", rules); !res.Allowed {
		t.Fatal("denied after the refund, want the slot back")
	}
	if err := l.Refund(ctx, scope, "u1", rules, ""); err != nil {
		t.Errorf("Refund with an empty token = %v, want a no-op", err)
	}
}

func TestRefundRemovesOnlyThatHit(t *testing.T) {
	l, scope := testLimiter(t)
	c := startClock(l)
	ctx := context.Background()
	rules := []Rule{{Name: "daily", Limit: 3, Window: time.Hour}}

	_, first, _ := l.Allow(ctx, scope, "u1", rules)
	c.add(time.Second)
	_, second, _ := l.Allow(ctx, scope, "u1", rules)
	if err := l.Refund(ctx, scope, "u1", rules, first); err != nil {
		t.Fatal(err)
	}
	members, err := l.rdb.ZRange(ctx, Key(scope, "u1", "daily"), 0, -1).Result()
	if err != nil {
		t.Fatal(err)
	}
	if len(members) != 1 || members[0] != second {
		t.Fatalf("members = %v, want only %q", members, second)
	}
}

func TestConcurrentRequestsCannotExceedLimit(t *testing.T) {
	l, scope := testLimiter(t)
	ctx := context.Background()
	rules := []Rule{{Name: "burst", Limit: 5, Window: time.Minute}}

	var allowed atomic.Int32
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, _, err := l.Allow(ctx, scope, "u1", rules)
			if err != nil {
				t.Error(err)
				return
			}
			if res.Allowed {
				allowed.Add(1)
			}
		}()
	}
	wg.Wait()
	if got := allowed.Load(); got != 5 {
		t.Fatalf("%d of 20 concurrent requests allowed, want exactly 5", got)
	}
}

func TestRejectsNonPositiveRules(t *testing.T) {
	l := New(nil) // rules are validated before Redis is touched
	for _, r := range []Rule{{Name: "zero", Limit: 0, Window: time.Minute}, {Name: "nowindow", Limit: 1}} {
		if _, _, err := l.Allow(context.Background(), "s", "u1", []Rule{r}); err == nil {
			t.Errorf("rule %+v: err = nil, want an error", r)
		}
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
docker run --rm --network container:fb-redis-test -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app \
  -e REDIS_TEST_ADDR=127.0.0.1:6379 golang:1.22 go test ./internal/ratelimit/ -v
```
Expected: FAIL to compile: `undefined: Limiter`, `undefined: New`, `undefined: Rule`, `undefined: Key`.

- [ ] **Step 4: Write the implementation**

Create `be/internal/ratelimit/ratelimit.go`:

```go
// Package ratelimit enforces per-subject request limits with a sliding-window
// log kept in Redis.
//
// Each rule for each subject is one sorted set of hit tokens, scored by the
// time of the hit in milliseconds. A single Lua script trims expired hits,
// checks every rule, and records the new hit in all of them only when every
// rule passes. So concurrent requests cannot both slip under a limit, and a
// request denied by one rule never uses up a slot in another.
package ratelimit

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Rule is one limit: at most Limit hits within any Window-long span.
type Rule struct {
	Name   string // key suffix, e.g. "cooldown" or "daily"; unique within a scope
	Limit  int
	Window time.Duration
}

// Result is the outcome of Allow.
type Result struct {
	Allowed bool
	// RetryAfter is how long until the denying rule frees a slot. It is set
	// only when Allowed is false; when several rules deny, it is the longest wait.
	RetryAfter time.Duration
	// Rule names the rule that set RetryAfter.
	Rule string
}

// Limiter checks and records hits in Redis.
type Limiter struct {
	rdb *redis.Client
	now func() time.Time
}

func New(rdb *redis.Client) *Limiter {
	return &Limiter{rdb: rdb, now: time.Now}
}

// allowScript takes one sorted-set key per rule.
// ARGV[1] = now in ms, ARGV[2] = token, then for rule i (1-based):
// ARGV[1+2i] = limit and ARGV[2+2i] = window in ms.
// It returns {1, 0, 0} when allowed, or {0, wait_ms, rule_index} when denied.
var allowScript = redis.NewScript(`
local now = tonumber(ARGV[1])
local worst_wait, worst_idx = -1, 0
for i = 1, #KEYS do
  local limit = tonumber(ARGV[1 + 2 * i])
  local window = tonumber(ARGV[2 + 2 * i])
  redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[i])
  if count >= limit then
    -- A slot frees when the hit at rank (count - limit) leaves the window.
    local hit = redis.call('ZRANGE', KEYS[i], count - limit, count - limit, 'WITHSCORES')
    local wait = tonumber(hit[2]) + window - now
    if wait > worst_wait then
      worst_wait = wait
      worst_idx = i
    end
  end
end
if worst_idx > 0 then
  return {0, worst_wait, worst_idx}
end
for i = 1, #KEYS do
  redis.call('ZADD', KEYS[i], ARGV[1], ARGV[2])
  redis.call('PEXPIRE', KEYS[i], ARGV[2 + 2 * i])
end
return {1, 0, 0}
`)

// Allow checks every rule for subject and, only if all of them pass, records
// one hit in each. The returned token identifies that hit for Refund; it is
// empty when the request was denied.
func (l *Limiter) Allow(ctx context.Context, scope, subject string, rules []Rule) (Result, string, error) {
	if len(rules) == 0 {
		return Result{Allowed: true}, "", nil
	}
	for _, r := range rules {
		if r.Limit < 1 || r.Window <= 0 {
			return Result{}, "", fmt.Errorf("ratelimit: rule %q needs a positive limit and window", r.Name)
		}
	}

	now := l.now().UnixMilli()
	token, err := newToken(now)
	if err != nil {
		return Result{}, "", err
	}
	keys := make([]string, len(rules))
	args := make([]any, 0, 2+2*len(rules))
	args = append(args, now, token)
	for i, r := range rules {
		keys[i] = Key(scope, subject, r.Name)
		args = append(args, r.Limit, r.Window.Milliseconds())
	}

	res, err := allowScript.Run(ctx, l.rdb, keys, args...).Int64Slice()
	if err != nil {
		return Result{}, "", fmt.Errorf("ratelimit: %w", err)
	}
	if len(res) != 3 {
		return Result{}, "", fmt.Errorf("ratelimit: unexpected script reply %v", res)
	}
	if res[0] == 1 {
		return Result{Allowed: true}, token, nil
	}
	return Result{
		RetryAfter: time.Duration(res[1]) * time.Millisecond,
		Rule:       rules[res[2]-1].Name,
	}, "", nil
}

// Refund removes the hit recorded under token from every rule, giving the
// slot back. A hit that is already gone is not an error.
func (l *Limiter) Refund(ctx context.Context, scope, subject string, rules []Rule, token string) error {
	if token == "" || len(rules) == 0 {
		return nil
	}
	pipe := l.rdb.TxPipeline()
	for _, r := range rules {
		pipe.ZRem(ctx, Key(scope, subject, r.Name), token)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("ratelimit refund: %w", err)
	}
	return nil
}

// Key is the Redis key for one rule of one subject. The braces are a hash tag:
// they keep all of a subject's keys in one cluster slot, which the multi-key
// script requires if Redis is ever clustered.
func Key(scope, subject, rule string) string {
	return fmt.Sprintf("rl:{%s:%s}:%s", scope, subject, rule)
}

func newToken(nowMs int64) (string, error) {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("ratelimit token: %w", err)
	}
	return fmt.Sprintf("%d-%s", nowMs, hex.EncodeToString(b[:])), nil
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the same command as in Step 3.
Expected: all 9 tests PASS, and none reports SKIP. A SKIP means `REDIS_TEST_ADDR` did not reach the container.

- [ ] **Step 6: Vet, then commit**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go vet ./internal/ratelimit/
git add be/internal/ratelimit/
git commit -m "feat(ratelimit): Redis sliding-window limiter with atomic multi-rule check

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Per-user rate-limit middleware

**Files:**
- Create: `be/internal/middleware/ratelimit.go`
- Modify: `be/internal/middleware/auth.go` (add `WithUserID` after `UserIDFromCtx`)
- Test: `be/internal/middleware/ratelimit_test.go`

**Interfaces:**
- Consumes: `ratelimit.Rule` and `ratelimit.Result` from Task 1. `*ratelimit.Limiter` satisfies `RateLimiter`.
- Produces:
  - `type RateLimiter interface { Allow(...) (ratelimit.Result, string, error); Refund(...) error }`, with the same signatures as `*ratelimit.Limiter`
  - `func RateLimitPerUser(l RateLimiter, scope string, rules ...ratelimit.Rule) func(http.Handler) http.Handler`
  - `func WithUserID(ctx context.Context, userID int64) context.Context`, which Task 5's handler tests use

- [ ] **Step 1: Add the `WithUserID` test helper**

In `be/internal/middleware/auth.go`, add this after the `UserIDFromCtx` function:

```go
// WithUserID returns ctx carrying userID as the authenticated user, exactly as
// Auth would set it. For tests of handlers and middleware that sit behind Auth.
func WithUserID(ctx context.Context, userID int64) context.Context {
	return context.WithValue(ctx, ctxUserID, userID)
}
```

- [ ] **Step 2: Write the failing tests**

Create `be/internal/middleware/ratelimit_test.go`:

```go
package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"final-review/be/internal/ratelimit"
)

type fakeLimiter struct {
	result  ratelimit.Result
	err     error
	calls   int
	scope   string
	subject string
	refunds []string
}

func (f *fakeLimiter) Allow(_ context.Context, scope, subject string, _ []ratelimit.Rule) (ratelimit.Result, string, error) {
	f.calls++
	f.scope, f.subject = scope, subject
	if f.err != nil {
		return ratelimit.Result{}, "", f.err
	}
	if !f.result.Allowed {
		return f.result, "", nil
	}
	return f.result, "tok-1", nil
}

func (f *fakeLimiter) Refund(_ context.Context, _, _ string, _ []ratelimit.Rule, token string) error {
	f.refunds = append(f.refunds, token)
	return nil
}

// serve runs one request through the middleware. The wrapped handler answers
// handlerStatus, and the returned bool reports whether it ran at all.
func serve(l RateLimiter, userID int64, handlerStatus int) (*httptest.ResponseRecorder, bool) {
	ran := false
	h := RateLimitPerUser(l, "feedback", ratelimit.Rule{Name: "cooldown", Limit: 1, Window: time.Minute})(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ran = true
			w.WriteHeader(handlerStatus)
		}))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/feedback", nil)
	if userID != 0 {
		req = req.WithContext(WithUserID(req.Context(), userID))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec, ran
}

func decodeBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&m); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	return m
}

func TestRateLimitDeniesWithRetryAfter(t *testing.T) {
	l := &fakeLimiter{result: ratelimit.Result{RetryAfter: 42*time.Second + 200*time.Millisecond, Rule: "cooldown"}}
	rec, ran := serve(l, 42, http.StatusCreated)
	if ran {
		t.Fatal("handler ran for a denied request")
	}
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec.Code)
	}
	if got := rec.Header().Get("Retry-After"); got != "43" {
		t.Errorf("Retry-After = %q, want 43 (rounded up)", got)
	}
	body := decodeBody(t, rec)
	if body["code"] != "rate_limited" || body["retry_after"] != float64(43) {
		t.Errorf("body = %v, want code rate_limited and retry_after 43", body)
	}
}

func TestRateLimitRoundsSubSecondWaitUpToOne(t *testing.T) {
	l := &fakeLimiter{result: ratelimit.Result{RetryAfter: 300 * time.Millisecond}}
	rec, _ := serve(l, 42, http.StatusCreated)
	if got := rec.Header().Get("Retry-After"); got != "1" {
		t.Errorf("Retry-After = %q, want 1", got)
	}
}

func TestRateLimitKeepsHitOnSuccess(t *testing.T) {
	l := &fakeLimiter{result: ratelimit.Result{Allowed: true}}
	rec, ran := serve(l, 42, http.StatusCreated)
	if !ran || rec.Code != http.StatusCreated {
		t.Fatalf("ran=%v status=%d, want the handler's 201", ran, rec.Code)
	}
	if l.scope != "feedback" || l.subject != "42" {
		t.Errorf("keyed on scope=%q subject=%q, want feedback and 42", l.scope, l.subject)
	}
	if len(l.refunds) != 0 {
		t.Errorf("refunds = %v, want none after a 201", l.refunds)
	}
}

func TestRateLimitRefundsWhenHandlerRejects(t *testing.T) {
	for _, status := range []int{http.StatusBadRequest, http.StatusConflict, http.StatusTooManyRequests, http.StatusInternalServerError} {
		l := &fakeLimiter{result: ratelimit.Result{Allowed: true}}
		serve(l, 42, status)
		if len(l.refunds) != 1 || l.refunds[0] != "tok-1" {
			t.Errorf("handler status %d: refunds = %v, want [tok-1]", status, l.refunds)
		}
	}
}

func TestRateLimitFailsClosed(t *testing.T) {
	l := &fakeLimiter{err: errors.New("dial tcp: connection refused")}
	rec, ran := serve(l, 42, http.StatusCreated)
	if ran {
		t.Fatal("handler ran while the limiter was down")
	}
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if body := decodeBody(t, rec); body["code"] != "rate_limit_unavailable" {
		t.Errorf("code = %v, want rate_limit_unavailable", body["code"])
	}
}

func TestRateLimitRequiresAuthenticatedUser(t *testing.T) {
	l := &fakeLimiter{result: ratelimit.Result{Allowed: true}}
	rec, ran := serve(l, 0, http.StatusCreated)
	if ran || l.calls != 0 {
		t.Fatalf("ran=%v limiter calls=%d, want neither without a user", ran, l.calls)
	}
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go test ./internal/middleware/ -v
```
Expected: FAIL to compile: `undefined: RateLimitPerUser` and `undefined: RateLimiter`.

- [ ] **Step 4: Write the implementation**

Create `be/internal/middleware/ratelimit.go`:

```go
package middleware

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"final-review/be/internal/ratelimit"
	chimw "github.com/go-chi/chi/v5/middleware"
)

// RateLimiter is the part of *ratelimit.Limiter the middleware uses. It is an
// interface so the middleware can be tested without Redis.
type RateLimiter interface {
	Allow(ctx context.Context, scope, subject string, rules []ratelimit.Rule) (ratelimit.Result, string, error)
	Refund(ctx context.Context, scope, subject string, rules []ratelimit.Rule, token string) error
}

// RateLimitPerUser limits how often the authenticated user may call the
// wrapped handler. It must be mounted after Auth.
//
// Only requests that succeed count. When the handler answers with a status of
// 400 or more, the hit is refunded, so a rejected request (a typo, a
// duplicate) does not use up one of the user's slots.
//
// It fails closed. If Redis cannot be reached, the request is refused with a
// 503 rather than let through unlimited. Sessions already depend on Redis, so
// this adds no new way for the endpoint to be down.
func RateLimitPerUser(l RateLimiter, scope string, rules ...ratelimit.Rule) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := UserIDFromCtx(r.Context())
			if userID == 0 {
				// Mounted without Auth in front of it: refuse rather than put
				// every anonymous caller into one shared bucket.
				writeLimitError(w, http.StatusUnauthorized, "unauthorized", "unauthorized", 0)
				return
			}
			subject := strconv.FormatInt(userID, 10)

			res, token, err := l.Allow(r.Context(), scope, subject, rules)
			if err != nil {
				log.Printf("ERROR ratelimit scope=%s user=%d: %v", scope, userID, err)
				writeLimitError(w, http.StatusServiceUnavailable, "rate_limit_unavailable", "please try again in a moment", 0)
				return
			}
			if !res.Allowed {
				secs := int(math.Ceil(res.RetryAfter.Seconds()))
				if secs < 1 {
					secs = 1
				}
				w.Header().Set("Retry-After", strconv.Itoa(secs))
				writeLimitError(w, http.StatusTooManyRequests, "rate_limited", "too many requests", secs)
				return
			}

			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			if ww.Status() >= 400 {
				ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
				defer cancel()
				if err := l.Refund(ctx, scope, subject, rules, token); err != nil {
					log.Printf("WARN ratelimit refund scope=%s user=%d: %v", scope, userID, err)
				}
			}
		})
	}
}

func writeLimitError(w http.ResponseWriter, status int, code, msg string, retryAfter int) {
	body := map[string]any{"error": msg, "code": code}
	if retryAfter > 0 {
		body["retry_after"] = retryAfter
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run the same command as in Step 3.
Expected: all 6 tests PASS.

- [ ] **Step 6: Vet, then commit**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go vet ./internal/middleware/
git add be/internal/middleware/ratelimit.go be/internal/middleware/ratelimit_test.go be/internal/middleware/auth.go
git commit -m "feat(middleware): per-user rate limit that refunds rejected requests and fails closed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Feedback rules package

**Files:**
- Create: `be/internal/feedback/feedback.go`
- Test: `be/internal/feedback/feedback_test.go`

**Interfaces:**
- Consumes: `ratelimit.Rule` from Task 1
- Produces. Tasks 4 and 5 use these exact names:
  - Constants: `MinLength=20`, `MaxLength=2000`, `MinDistinct=6`, `MaxLinks=2`, `MaxPagePath=300`, `MaxUserAgent=255`, `MaxReply=2000`, `SpamPauseThreshold=3`, `SpamWindowDays=30`, `DuplicateWindowDays=30`, `MaxOpen=10`
  - `var RateRules []ratelimit.Rule`, set to cooldown 1/1m and daily 5/24h
  - Error codes: `CodeInvalidBody`, `CodeInvalidType`, `CodeTooShort`, `CodeTooLong`, `CodeLowEffort`, `CodeTooManyLinks`, `CodePaused`, `CodeDuplicate`, `CodeTooManyOpen`, `CodeInvalidStatus`, `CodeInvalidReply`
  - `ValidType(string) bool` and `ValidStatus(string) bool`
  - `Clean(string) string`
  - `Validate(message string) (cleaned string, code string)`
  - `Fingerprint(cleaned string) string`
  - `CleanPagePath(string) string` and `CleanUserAgent(string) string`
  - `CleanReply(string) (cleaned string, code string)`
  - `PublicStatus(string) string`
  - `Admission(spamRecent, duplicates, open int) string`

- [ ] **Step 1: Write the failing tests**

Create `be/internal/feedback/feedback_test.go`:

```go
package feedback

import (
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"final-review/be/internal/ratelimit"
)

func TestClean(t *testing.T) {
	cases := []struct{ name, in, want string }{
		{"crlf and lone cr become lf", "line one\r\nline two\rline three", "line one\nline two\nline three"},
		{"tab becomes space", "a\tb", "a b"},
		{"control characters removed", "a\x00b\x1bc\x7fd", "abcd"},
		{"zero-width joiner and non-joiner kept", "র\u200d্য ক\u200cষ", "র\u200d্য ক\u200cষ"},
		{"blank lines collapse to one", "a\n\n\n\n\nb", "a\n\nb"},
		{"whitespace-only lines collapse too", "a\n   \n\t\n  \nb", "a\n\nb"},
		{"outer whitespace trimmed", "  \n hello \n  ", "hello"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Clean(c.in); got != c.want {
				t.Errorf("Clean(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}

	t.Run("invalid utf-8 becomes valid", func(t *testing.T) {
		if got := Clean("ok \xff\xfe ok"); !utf8.ValidString(got) {
			t.Errorf("Clean produced invalid UTF-8: %q", got)
		}
	})
}

// bangla20 is 20 distinct Bangla letters: 20 runes but 60 bytes, so it tells
// rune counting apart from byte counting.
const bangla20 = "অআইঈউঊঋএঐওঔকখগঘঙচছজঝ"

func TestValidate(t *testing.T) {
	if n := utf8.RuneCountInString(bangla20); n != 20 {
		t.Fatalf("fixture has %d runes, want 20", n)
	}
	longOK := strings.Repeat("abcdefghij", 200) // 2000 runes

	cases := []struct{ name, in, wantCode string }{
		{"19 runes is too short", "abcdefghijklmnopqrs", CodeTooShort},
		{"20 runes is fine", "abcdefghijklmnopqrst", ""},
		{"19 Bangla runes is too short even at 57 bytes", string([]rune(bangla20)[:19]), CodeTooShort},
		{"20 Bangla runes is fine", bangla20, ""},
		{"length is counted after cleaning", "   abcdefghijklmnopqrs   ", CodeTooShort},
		{"2000 runes is fine", longOK, ""},
		{"2001 runes is too long", longOK + "k", CodeTooLong},
		{"one repeated character", strings.Repeat("a", 30), CodeLowEffort},
		{"five distinct characters", "abcde abcde abcde abcde", CodeLowEffort},
		{"six distinct characters", "abcdef abcdef abcdef", ""},
		{"two links are fine", "see https://a.example and www.b.example please", ""},
		{"scheme plus www counts as one link", "see https://www.a.example and https://www.b.example", ""},
		{"three links", "see https://a.example http://b.example www.c.example now", CodeTooManyLinks},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if _, code := Validate(c.in); code != c.wantCode {
				t.Errorf("Validate(%.30q) code = %q, want %q", c.in, code, c.wantCode)
			}
		})
	}

	t.Run("returns the cleaned text", func(t *testing.T) {
		got, code := Validate("  The checkout button does nothing.\r\n\r\n\r\nPlease fix  ")
		if code != "" {
			t.Fatalf("code = %q, want accepted", code)
		}
		if want := "The checkout button does nothing.\n\nPlease fix"; got != want {
			t.Errorf("cleaned = %q, want %q", got, want)
		}
	})
}

func TestFingerprint(t *testing.T) {
	a := Fingerprint("Hello   World,\nthe app crashed")
	b := Fingerprint("hello world, the APP crashed")
	if a != b {
		t.Errorf("case and spacing changed the fingerprint: %s vs %s", a, b)
	}
	if len(a) != 64 {
		t.Errorf("len = %d, want 64 hex characters", len(a))
	}
	if a == Fingerprint("hello world, the app froze") {
		t.Error("different text produced the same fingerprint")
	}
}

func TestCleanPagePath(t *testing.T) {
	cases := []struct{ in, want string }{
		{"/review/12", "/review/12"},
		{"  /browse?q=phone  ", "/browse?q=phone"},
		{"", ""},
		{"review/12", ""},
		{"//evil.example/x", ""},
		{"/\\evil.example", ""},
		{"https://evil.example/", ""},
		{"/a\x00b", ""},
		{"/" + strings.Repeat("a", 299), "/" + strings.Repeat("a", 299)}, // 300 runes
		{"/" + strings.Repeat("a", 300), ""},                             // 301 runes
	}
	for _, c := range cases {
		if got := CleanPagePath(c.in); got != c.want {
			t.Errorf("CleanPagePath(%.40q) = %.40q, want %.40q", c.in, got, c.want)
		}
	}
}

func TestCleanUserAgent(t *testing.T) {
	if got := CleanUserAgent(strings.Repeat("x", 300)); utf8.RuneCountInString(got) != MaxUserAgent {
		t.Errorf("long UA kept %d runes, want %d", utf8.RuneCountInString(got), MaxUserAgent)
	}
	if got := CleanUserAgent("Mozilla\xff/5.0"); got != "Mozilla/5.0" {
		t.Errorf("CleanUserAgent = %q, want invalid bytes dropped", got)
	}
}

func TestCleanReply(t *testing.T) {
	if got, code := CleanReply("  Thanks, fixed.  "); got != "Thanks, fixed." || code != "" {
		t.Errorf("CleanReply = (%q, %q), want trimmed and accepted", got, code)
	}
	if got, code := CleanReply("   "); got != "" || code != "" {
		t.Errorf("blank reply = (%q, %q), want empty and accepted: it clears the reply", got, code)
	}
	if _, code := CleanReply(strings.Repeat("a", MaxReply+1)); code != CodeInvalidReply {
		t.Errorf("over-long reply code = %q, want %q", code, CodeInvalidReply)
	}
}

func TestPublicStatus(t *testing.T) {
	for in, want := range map[string]string{"new": "new", "in_progress": "in_progress", "resolved": "resolved", "spam": "closed"} {
		if got := PublicStatus(in); got != want {
			t.Errorf("PublicStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidTypeAndStatus(t *testing.T) {
	for _, ok := range []string{"bug", "idea", "complaint", "praise", "other"} {
		if !ValidType(ok) {
			t.Errorf("ValidType(%q) = false", ok)
		}
	}
	for _, ok := range []string{"new", "in_progress", "resolved", "spam"} {
		if !ValidStatus(ok) {
			t.Errorf("ValidStatus(%q) = false", ok)
		}
	}
	for _, bad := range []string{"", "Bug", "closed", "rant"} {
		if ValidType(bad) || ValidStatus(bad) {
			t.Errorf("%q accepted as a type or status", bad)
		}
	}
}

func TestAdmission(t *testing.T) {
	cases := []struct {
		name            string
		spam, dup, open int
		want            string
	}{
		{"clean history", 0, 0, 0, ""},
		{"two spam is not yet a pause", 2, 0, 0, ""},
		{"three spam pauses", 3, 0, 0, CodePaused},
		{"pause wins over duplicate and open", 3, 1, 10, CodePaused},
		{"duplicate", 0, 1, 0, CodeDuplicate},
		{"duplicate wins over open", 0, 1, 10, CodeDuplicate},
		{"nine open is fine", 0, 0, 9, ""},
		{"ten open blocks", 0, 0, 10, CodeTooManyOpen},
	}
	for _, c := range cases {
		if got := Admission(c.spam, c.dup, c.open); got != c.want {
			t.Errorf("%s: Admission(%d, %d, %d) = %q, want %q", c.name, c.spam, c.dup, c.open, got, c.want)
		}
	}
}

// The cooldown is load-bearing: the handler's MySQL checks skip locking
// because it lets at most one of a user's requests through per minute.
func TestRateRules(t *testing.T) {
	want := []ratelimit.Rule{
		{Name: "cooldown", Limit: 1, Window: time.Minute},
		{Name: "daily", Limit: 5, Window: 24 * time.Hour},
	}
	if len(RateRules) != len(want) || RateRules[0] != want[0] || RateRules[1] != want[1] {
		t.Errorf("RateRules = %+v, want %+v", RateRules, want)
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go test ./internal/feedback/ -v
```
Expected: FAIL to compile, because the package has no non-test files (`undefined: Clean`, …).

- [ ] **Step 3: Write the implementation**

Create `be/internal/feedback/feedback.go`:

```go
// Package feedback holds the rules for user feedback: what a valid message
// is, how it is cleaned before storage, when a user may send more, and the
// error codes clients receive. Everything here is pure, so it can be tested
// without a database. The numbers are product decisions recorded in
// docs/superpowers/specs/2026-09-11-user-feedback-design.md.
package feedback

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"final-review/be/internal/ratelimit"
)

const (
	MinLength    = 20   // runes, after cleaning
	MaxLength    = 2000 // runes, after cleaning
	MinDistinct  = 6    // distinct non-space characters
	MaxLinks     = 2
	MaxPagePath  = 300
	MaxUserAgent = 255
	MaxReply     = 2000

	SpamPauseThreshold  = 3 // spam-marked items within SpamWindowDays pause the user
	SpamWindowDays      = 30
	DuplicateWindowDays = 30
	MaxOpen             = 10 // items still new or in progress, per user
)

// RateRules are the limits on sending feedback, enforced in Redis by
// middleware.RateLimitPerUser.
//
// The cooldown also serializes each user's submissions: at most one of their
// requests gets past the limiter per minute, which is what lets the MySQL
// admission checks run without locking. If the cooldown is ever removed,
// AdmissionCounts and Create must move into one transaction that locks the
// user's row (see be/internal/rewards/repo.go for the pattern).
var RateRules = []ratelimit.Rule{
	{Name: "cooldown", Limit: 1, Window: time.Minute},
	{Name: "daily", Limit: 5, Window: 24 * time.Hour},
}

// Error codes. They are part of the API contract: the frontend maps each one
// to a translated message, so renaming one is a breaking change.
const (
	CodeInvalidBody   = "invalid_body"
	CodeInvalidType   = "invalid_type"
	CodeTooShort      = "message_too_short"
	CodeTooLong       = "message_too_long"
	CodeLowEffort     = "message_low_effort"
	CodeTooManyLinks  = "too_many_links"
	CodePaused        = "paused"
	CodeDuplicate     = "duplicate"
	CodeTooManyOpen   = "too_many_open"
	CodeInvalidStatus = "invalid_status"
	CodeInvalidReply  = "invalid_reply"
)

var (
	types    = map[string]bool{"bug": true, "idea": true, "complaint": true, "praise": true, "other": true}
	statuses = map[string]bool{"new": true, "in_progress": true, "resolved": true, "spam": true}

	// A link is a scheme or "www." followed by non-space characters, so
	// "https://www.example.com" counts once, not twice.
	linkPattern = regexp.MustCompile(`(?i)(?:https?://|www\.)\S+`)
	blankRuns   = regexp.MustCompile(`\n{3,}`)
)

func ValidType(t string) bool   { return types[t] }
func ValidStatus(s string) bool { return statuses[s] }

// Clean normalizes user text before it is validated or stored:
//   - CRLF and lone CR become LF, and tabs become spaces
//   - control characters (Unicode Cc) other than LF are removed. Zero-width
//     joiner and non-joiner are format characters (Cf), not controls, so
//     they are kept: Bangla needs them inside conjuncts
//   - invalid UTF-8 becomes U+FFFD, so MySQL never rejects the row
//   - trailing spaces are trimmed from each line, the whole text is trimmed,
//     and three or more newlines in a row collapse to two
func Clean(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s { // ranging decodes invalid bytes as U+FFFD
		switch {
		case r == '\n':
			b.WriteRune(r)
		case r == '\t':
			b.WriteByte(' ')
		case unicode.IsControl(r):
			// dropped
		default:
			b.WriteRune(r)
		}
	}
	lines := strings.Split(b.String(), "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRightFunc(line, unicode.IsSpace)
	}
	out := strings.TrimSpace(strings.Join(lines, "\n"))
	return blankRuns.ReplaceAllString(out, "\n\n")
}

// Validate cleans message and checks it against the content rules. It returns
// the cleaned text and "" when the message is acceptable, or an error code.
func Validate(message string) (string, string) {
	m := Clean(message)
	n := utf8.RuneCountInString(m)
	switch {
	case n < MinLength:
		return m, CodeTooShort
	case n > MaxLength:
		return m, CodeTooLong
	case distinctNonSpace(m) < MinDistinct:
		return m, CodeLowEffort
	case len(linkPattern.FindAllStringIndex(m, -1)) > MaxLinks:
		return m, CodeTooManyLinks
	}
	return m, ""
}

func distinctNonSpace(s string) int {
	seen := map[rune]struct{}{}
	for _, r := range s {
		if !unicode.IsSpace(r) {
			seen[r] = struct{}{}
		}
	}
	return len(seen)
}

// Fingerprint identifies a message for the duplicate check. It is the SHA-256
// of the text lowercased with every run of whitespace collapsed to one space,
// so resending with different capitalization or spacing still matches.
func Fingerprint(cleaned string) string {
	norm := strings.Join(strings.Fields(strings.ToLower(cleaned)), " ")
	sum := sha256.Sum256([]byte(norm))
	return hex.EncodeToString(sum[:])
}

// CleanPagePath returns p when it is a safe same-site path to store, else "".
// It must start with a single "/" (so "//host" and "https://host" are
// refused), contain no backslash or control character, and fit the column.
// A bad path is dropped rather than failing the request: it is context, not
// the feedback itself.
func CleanPagePath(p string) string {
	p = strings.TrimSpace(p)
	if !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.ContainsRune(p, '\\') {
		return ""
	}
	if utf8.RuneCountInString(p) > MaxPagePath {
		return ""
	}
	for _, r := range p {
		if unicode.IsControl(r) || r == utf8.RuneError {
			return ""
		}
	}
	return p
}

// CleanUserAgent makes a User-Agent header safe to store: valid UTF-8,
// truncated to the column width.
func CleanUserAgent(ua string) string {
	return truncateRunes(strings.ToValidUTF8(strings.TrimSpace(ua), ""), MaxUserAgent)
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// CleanReply prepares an admin reply. An empty result is valid and means
// "remove the reply"; otherwise it may not exceed MaxReply runes.
func CleanReply(s string) (string, string) {
	r := Clean(s)
	if utf8.RuneCountInString(r) > MaxReply {
		return r, CodeInvalidReply
	}
	return r, ""
}

// PublicStatus is the status users see on their own items. Spam is shown as
// "closed": telling someone they were flagged invites an argument and
// teaches nothing.
func PublicStatus(s string) string {
	if s == "spam" {
		return "closed"
	}
	return s
}

// Admission decides from the user's history whether a new item may be
// stored. The order matters: a paused user learns nothing else.
func Admission(spamRecent, duplicates, open int) string {
	switch {
	case spamRecent >= SpamPauseThreshold:
		return CodePaused
	case duplicates > 0:
		return CodeDuplicate
	case open >= MaxOpen:
		return CodeTooManyOpen
	}
	return ""
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run the same command as in Step 2.
Expected: every test PASSES.

- [ ] **Step 5: Vet, then commit**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go vet ./internal/feedback/
git add be/internal/feedback/
git commit -m "feat(feedback): content rules, cleaning, fingerprint and admission policy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Migration, models, and repository

**Files:**
- Create: `be/migrations/016_feedback.sql`
- Create: `be/internal/models/feedback.go`
- Create: `be/internal/repository/feedback.go`
- Test: `be/internal/repository/feedback_integration_test.go`

**Interfaces:**
- Consumes: `feedback.PublicStatus`, `feedback.SpamWindowDays`, `feedback.DuplicateWindowDays`, and `feedback.Fingerprint` (test only), all from Task 3. `repository.ErrNotFound` (existing, in `user.go`).
- Produces. Task 5 depends on these exact names:
  - `models.Feedback{ID, Type, Message, Status, AdminReply string, RepliedAt *time.Time, ReplyUnread bool, CreatedAt}`, the user's view, with the public status
  - `models.AdminFeedback{…same…, PagePath, UserAgent string, User models.FeedbackUser}`, with the raw status
  - `models.FeedbackUser{ID int64, Username, Email string}`
  - `repository.NewFeedback{UserID int64, Type, Message, Hash, PagePath, UserAgent string}`
  - `repository.FeedbackFilter{Status, Type string, Limit, Offset int}`
  - `func NewFeedbackRepo(db *sql.DB) *FeedbackRepo`
  - `(*FeedbackRepo).AdmissionCounts(ctx, userID int64, hash string) (spam, dup, open int, err error)`
  - `(*FeedbackRepo).Create(ctx, NewFeedback) (*models.Feedback, error)`
  - `(*FeedbackRepo).ListMine(ctx, userID int64, limit int) ([]models.Feedback, error)`
  - `(*FeedbackRepo).UnreadCount(ctx, userID int64) (int, error)`
  - `(*FeedbackRepo).MarkSeen(ctx, userID int64) error`
  - `(*FeedbackRepo).AdminList(ctx, FeedbackFilter) ([]models.AdminFeedback, int, error)`
  - `(*FeedbackRepo).AdminUpdate(ctx, id int64, status, reply *string) error`, which returns `ErrNotFound` for an unknown id

- [ ] **Step 1: Write the migration**

Create `be/migrations/016_feedback.sql`:

```sql
-- User feedback about the platform: a type and a message from a logged-in
-- user, triaged by admins in the CMS, with one optional admin reply that the
-- user sees on their profile.
--
-- message_hash is the SHA-256 fingerprint used by the duplicate check (see
-- be/internal/feedback). reply_unread drives the "new reply" dot in the
-- header. Status 'spam' is shown to the user as "closed".
CREATE TABLE IF NOT EXISTS feedback (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  type         ENUM('bug','idea','complaint','praise','other') NOT NULL,
  message      TEXT NOT NULL,
  message_hash CHAR(64) NOT NULL,
  page_path    VARCHAR(300) NULL,
  user_agent   VARCHAR(255) NULL,
  status       ENUM('new','in_progress','resolved','spam') NOT NULL DEFAULT 'new',
  admin_reply  TEXT NULL,
  replied_at   TIMESTAMP NULL,
  reply_unread TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_feedback_user (user_id, created_at),
  INDEX idx_feedback_status (status, created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: Write the models**

Create `be/internal/models/feedback.go`:

```go
package models

import "time"

// Feedback is one feedback item as its author sees it. Status is the public
// status: "spam" is reported as "closed" (see feedback.PublicStatus).
type Feedback struct {
	ID          int64      `json:"id"`
	Type        string     `json:"type"`
	Message     string     `json:"message"`
	Status      string     `json:"status"`
	AdminReply  string     `json:"admin_reply"` // "" when there is no reply
	RepliedAt   *time.Time `json:"replied_at"`
	ReplyUnread bool       `json:"reply_unread"`
	CreatedAt   time.Time  `json:"created_at"`
}

// AdminFeedback is one item as the CMS inbox sees it: the raw status, plus the
// context captured at submission and who sent it.
type AdminFeedback struct {
	ID          int64        `json:"id"`
	Type        string       `json:"type"`
	Message     string       `json:"message"`
	Status      string       `json:"status"`
	AdminReply  string       `json:"admin_reply"`
	RepliedAt   *time.Time   `json:"replied_at"`
	ReplyUnread bool         `json:"reply_unread"`
	PagePath    string       `json:"page_path"`
	UserAgent   string       `json:"user_agent"`
	User        FeedbackUser `json:"user"`
	CreatedAt   time.Time    `json:"created_at"`
}

type FeedbackUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}
```

- [ ] **Step 3: Write the failing integration tests**

Create `be/internal/repository/feedback_integration_test.go`:

```go
package repository

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"testing"

	"final-review/be/internal/feedback"
	"final-review/be/internal/models"
	"github.com/go-sql-driver/mysql"
)

// testFeedbackRepo needs a THROWAWAY MySQL named in MYSQL_TEST_DSN, and the
// database name must end in "_test" because this drops and recreates tables.
// It builds a minimal users table and applies the real 016 migration, so the
// migration itself is under test.
func testFeedbackRepo(t *testing.T) (*FeedbackRepo, *sql.DB) {
	t.Helper()
	dsn := os.Getenv("MYSQL_TEST_DSN")
	if dsn == "" {
		t.Skip("MYSQL_TEST_DSN not set; skipping MySQL-backed feedback tests")
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("parse MYSQL_TEST_DSN: %v", err)
	}
	if !strings.HasSuffix(cfg.DBName, "_test") {
		t.Fatalf("refusing to run against database %q: its name must end in _test", cfg.DBName)
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	migration, err := os.ReadFile("../../migrations/016_feedback.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range []string{
		`DROP TABLE IF EXISTS feedback`,
		`DROP TABLE IF EXISTS users`,
		`CREATE TABLE users (
		   id       BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
		   email    VARCHAR(255) NOT NULL UNIQUE,
		   username VARCHAR(100) NULL
		 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
		`INSERT INTO users (id, email, username) VALUES (1, 'a@example.com', 'alice'), (2, 'b@example.com', NULL)`,
		string(migration),
	} {
		if _, err := db.Exec(stmt); err != nil {
			t.Fatalf("setup %.50q: %v", stmt, err)
		}
	}
	return NewFeedbackRepo(db), db
}

func mustCreate(t *testing.T, r *FeedbackRepo, userID int64, typ, msg string) *models.Feedback {
	t.Helper()
	f, err := r.Create(context.Background(), NewFeedback{UserID: userID, Type: typ, Message: msg, Hash: feedback.Fingerprint(msg)})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	return f
}

func mustExec(t *testing.T, db *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := db.Exec(q, args...); err != nil {
		t.Fatalf("exec %.50q: %v", q, err)
	}
}

func TestFeedbackRepoCreateAndListMine(t *testing.T) {
	r, _ := testFeedbackRepo(t)
	ctx := context.Background()

	first, err := r.Create(ctx, NewFeedback{
		UserID: 1, Type: "bug", Message: "The checkout button does nothing", Hash: "h1",
		PagePath: "/review/12", UserAgent: "TestBrowser/1.0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.ID == 0 || first.Status != "new" || first.Type != "bug" || first.ReplyUnread || first.RepliedAt != nil {
		t.Fatalf("created = %+v, want a new bug with no reply", first)
	}
	second := mustCreate(t, r, 1, "idea", "Please add a dark mode toggle")
	mustCreate(t, r, 2, "other", "Someone else's feedback here")

	list, err := r.ListMine(ctx, 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].ID != second.ID || list[1].ID != first.ID {
		t.Fatalf("ListMine = %+v, want user 1's two items, newest first", list)
	}
}

func TestFeedbackRepoAdmissionCounts(t *testing.T) {
	r, db := testFeedbackRepo(t)
	ctx := context.Background()

	spam, dup, open, err := r.AdmissionCounts(ctx, 1, "h1")
	if err != nil {
		t.Fatal(err)
	}
	if spam != 0 || dup != 0 || open != 0 {
		t.Fatalf("fresh user: spam=%d dup=%d open=%d, want all 0", spam, dup, open)
	}

	insert := `INSERT INTO feedback (user_id, type, message, message_hash, status, created_at)
	           VALUES (1, 'bug', 'm', ?, ?, NOW() - INTERVAL ? DAY)`
	mustExec(t, db, insert, "h1", "new", 0)
	mustExec(t, db, insert, "h2", "in_progress", 0)
	mustExec(t, db, insert, "h3", "resolved", 0)
	mustExec(t, db, insert, "h4", "spam", 1)
	mustExec(t, db, insert, "h5", "spam", 2)
	mustExec(t, db, insert, "h6", "spam", 31)     // too old to count toward a pause
	mustExec(t, db, insert, "old", "resolved", 31) // too old to count as a duplicate
	mustExec(t, db, `INSERT INTO feedback (user_id, type, message, message_hash) VALUES (2, 'bug', 'm', 'h1')`)

	spam, dup, open, err = r.AdmissionCounts(ctx, 1, "h1")
	if err != nil {
		t.Fatal(err)
	}
	if spam != 2 {
		t.Errorf("spam = %d, want 2 (the 31-day-old one is outside the window)", spam)
	}
	if dup != 1 {
		t.Errorf("dup = %d, want 1 (user 2's identical message must not count)", dup)
	}
	if open != 2 {
		t.Errorf("open = %d, want 2 (new + in_progress)", open)
	}

	if _, dup, _, _ := r.AdmissionCounts(ctx, 1, "old"); dup != 0 {
		t.Errorf("dup for a 31-day-old message = %d, want 0", dup)
	}
}

func TestFeedbackRepoListMineShowsSpamAsClosed(t *testing.T) {
	r, db := testFeedbackRepo(t)
	f := mustCreate(t, r, 1, "other", "buy cheap followers now at my site")
	mustExec(t, db, `UPDATE feedback SET status = 'spam' WHERE id = ?`, f.ID)

	list, err := r.ListMine(context.Background(), 1, 50)
	if err != nil {
		t.Fatal(err)
	}
	if list[0].Status != "closed" {
		t.Errorf("status = %q, want closed", list[0].Status)
	}
}

func TestFeedbackRepoAdminUpdate(t *testing.T) {
	r, _ := testFeedbackRepo(t)
	ctx := context.Background()
	f := mustCreate(t, r, 1, "bug", "The checkout button does nothing")

	status := "in_progress"
	if err := r.AdminUpdate(ctx, f.ID, &status, nil); err != nil {
		t.Fatal(err)
	}
	reply := "Thanks, we are on it."
	if err := r.AdminUpdate(ctx, f.ID, nil, &reply); err != nil {
		t.Fatal(err)
	}
	mine, _ := r.ListMine(ctx, 1, 50)
	if got := mine[0]; got.Status != "in_progress" || got.AdminReply != reply || !got.ReplyUnread || got.RepliedAt == nil {
		t.Fatalf("after status+reply: %+v, want in_progress with an unread reply", got)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 1 {
		t.Errorf("UnreadCount = %d, want 1", n)
	}

	if err := r.MarkSeen(ctx, 1); err != nil {
		t.Fatal(err)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 0 {
		t.Errorf("UnreadCount after MarkSeen = %d, want 0", n)
	}

	// Saving identical text is a no-op: it must not flag the reply unread again.
	if err := r.AdminUpdate(ctx, f.ID, nil, &reply); err != nil {
		t.Fatal(err)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 0 {
		t.Errorf("UnreadCount after re-saving the same reply = %d, want 0", n)
	}

	edited := "Fixed in today's release."
	if err := r.AdminUpdate(ctx, f.ID, nil, &edited); err != nil {
		t.Fatal(err)
	}
	if n, _ := r.UnreadCount(ctx, 1); n != 1 {
		t.Errorf("UnreadCount after editing the reply = %d, want 1", n)
	}

	empty := ""
	if err := r.AdminUpdate(ctx, f.ID, nil, &empty); err != nil {
		t.Fatal(err)
	}
	mine, _ = r.ListMine(ctx, 1, 50)
	if got := mine[0]; got.AdminReply != "" || got.RepliedAt != nil || got.ReplyUnread {
		t.Errorf("after clearing: %+v, want no reply", got)
	}

	if err := r.AdminUpdate(ctx, 99999, &status, nil); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown id: err = %v, want ErrNotFound", err)
	}
}

func TestFeedbackRepoAdminList(t *testing.T) {
	r, db := testFeedbackRepo(t)
	ctx := context.Background()
	oldest := mustCreate(t, r, 1, "bug", "Bug report from alice")
	mustCreate(t, r, 1, "idea", "Idea from alice for later")
	spammy := mustCreate(t, r, 2, "bug", "Bug report from user two")
	mustExec(t, db, `UPDATE feedback SET status = 'spam' WHERE id = ?`, spammy.ID)

	all, total, err := r.AdminList(ctx, FeedbackFilter{Limit: 50})
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(all) != 3 {
		t.Fatalf("all: total=%d len=%d, want 3/3", total, len(all))
	}

	bugs, total, _ := r.AdminList(ctx, FeedbackFilter{Type: "bug", Limit: 50})
	if total != 2 || len(bugs) != 2 {
		t.Errorf("type=bug: total=%d len=%d, want 2/2", total, len(bugs))
	}

	spam, total, _ := r.AdminList(ctx, FeedbackFilter{Status: "spam", Limit: 50})
	if total != 1 || len(spam) != 1 || spam[0].ID != spammy.ID || spam[0].Status != "spam" {
		t.Fatalf("status=spam: %+v (total %d), want only item %d with the raw spam status", spam, total, spammy.ID)
	}
	if u := spam[0].User; u.ID != 2 || u.Email != "b@example.com" || u.Username != "" {
		t.Errorf("user = %+v, want user 2 with the NULL username as empty", u)
	}

	page, total, _ := r.AdminList(ctx, FeedbackFilter{Limit: 1, Offset: 2})
	if total != 3 || len(page) != 1 || page[0].ID != oldest.ID {
		t.Errorf("limit 1 offset 2: %+v (total %d), want the oldest item %d", page, total, oldest.ID)
	}
}
```

- [ ] **Step 4: Start a throwaway MySQL and run the tests to verify they fail**

```bash
docker run -d --rm --name fb-mysql-test -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=feedback_test mysql:8.4.3
# TCP ping succeeds only on the final server: the image's init server runs without networking.
docker exec fb-mysql-test mysqladmin --protocol=tcp -h127.0.0.1 -uroot -ptest --wait=60 ping
docker run --rm --network container:fb-mysql-test -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app \
  -e MYSQL_TEST_DSN='root:test@tcp(127.0.0.1:3306)/feedback_test?parseTime=true&loc=UTC' \
  golang:1.22 go test ./internal/repository/ -run TestFeedbackRepo -v
```
Expected: `mysqld is alive`, and then the tests FAIL to compile: `undefined: FeedbackRepo`, `undefined: NewFeedback`, and so on. If `mysqladmin` returns before the server is ready, run it again. Keep the container: Task 5 and Task 9 reuse it.

- [ ] **Step 5: Write the repository**

Create `be/internal/repository/feedback.go`:

```go
package repository

import (
	"context"
	"database/sql"
	"strings"

	"final-review/be/internal/feedback"
	"final-review/be/internal/models"
)

type FeedbackRepo struct {
	db *sql.DB
}

func NewFeedbackRepo(db *sql.DB) *FeedbackRepo {
	return &FeedbackRepo{db: db}
}

// NewFeedback is a validated, cleaned submission ready to store.
type NewFeedback struct {
	UserID    int64
	Type      string
	Message   string
	Hash      string
	PagePath  string // "" is stored as NULL
	UserAgent string // "" is stored as NULL
}

// FeedbackFilter narrows the admin inbox. An empty Status or Type means any.
type FeedbackFilter struct {
	Status string
	Type   string
	Limit  int
	Offset int
}

// AdmissionCounts returns the three numbers feedback.Admission decides on:
// items marked spam recently, recent items with the same fingerprint, and
// items still open. It reads only the user's own rows.
func (r *FeedbackRepo) AdmissionCounts(ctx context.Context, userID int64, hash string) (spam, dup, open int, err error) {
	err = r.db.QueryRowContext(ctx, `
		SELECT
		  COALESCE(SUM(status = 'spam' AND created_at > NOW() - INTERVAL ? DAY), 0),
		  COALESCE(SUM(message_hash = ? AND created_at > NOW() - INTERVAL ? DAY), 0),
		  COALESCE(SUM(status IN ('new','in_progress')), 0)
		FROM feedback WHERE user_id = ?`,
		feedback.SpamWindowDays, hash, feedback.DuplicateWindowDays, userID,
	).Scan(&spam, &dup, &open)
	return
}

const feedbackUserCols = `id, type, message, status, COALESCE(admin_reply,''), replied_at, reply_unread, created_at`

func scanUserFeedback(s interface{ Scan(...any) error }) (models.Feedback, error) {
	var f models.Feedback
	var replied sql.NullTime
	var unread int
	if err := s.Scan(&f.ID, &f.Type, &f.Message, &f.Status, &f.AdminReply, &replied, &unread, &f.CreatedAt); err != nil {
		return f, err
	}
	f.Status = feedback.PublicStatus(f.Status)
	if replied.Valid {
		t := replied.Time
		f.RepliedAt = &t
	}
	f.ReplyUnread = unread == 1
	return f, nil
}

// Create stores a submission and returns it as its author sees it.
func (r *FeedbackRepo) Create(ctx context.Context, in NewFeedback) (*models.Feedback, error) {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO feedback (user_id, type, message, message_hash, page_path, user_agent)
		VALUES (?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))`,
		in.UserID, in.Type, in.Message, in.Hash, in.PagePath, in.UserAgent)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	f, err := scanUserFeedback(r.db.QueryRowContext(ctx,
		`SELECT `+feedbackUserCols+` FROM feedback WHERE id = ?`, id))
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// ListMine returns the user's newest items, at most limit of them.
func (r *FeedbackRepo) ListMine(ctx context.Context, userID int64, limit int) ([]models.Feedback, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+feedbackUserCols+` FROM feedback WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
		userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []models.Feedback{}
	for rows.Next() {
		f, err := scanUserFeedback(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	return list, rows.Err()
}

// UnreadCount is how many of the user's items carry a reply they have not seen.
func (r *FeedbackRepo) UnreadCount(ctx context.Context, userID int64) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM feedback WHERE user_id = ? AND reply_unread = 1`, userID).Scan(&n)
	return n, err
}

// MarkSeen clears the unread flag on all the user's replies.
func (r *FeedbackRepo) MarkSeen(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE feedback SET reply_unread = 0 WHERE user_id = ? AND reply_unread = 1`, userID)
	return err
}

// AdminList returns one page of the inbox, newest first, and the total that
// matches the filter.
func (r *FeedbackRepo) AdminList(ctx context.Context, f FeedbackFilter) ([]models.AdminFeedback, int, error) {
	where := []string{"1=1"}
	args := []any{}
	if f.Status != "" {
		where = append(where, "f.status = ?")
		args = append(args, f.Status)
	}
	if f.Type != "" {
		where = append(where, "f.type = ?")
		args = append(args, f.Type)
	}
	cond := strings.Join(where, " AND ")

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM feedback f WHERE `+cond, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT f.id, f.type, f.message, f.status, COALESCE(f.admin_reply,''), f.replied_at, f.reply_unread,
		       COALESCE(f.page_path,''), COALESCE(f.user_agent,''),
		       u.id, COALESCE(u.username,''), u.email, f.created_at
		FROM feedback f
		JOIN users u ON u.id = f.user_id
		WHERE `+cond+`
		ORDER BY f.created_at DESC, f.id DESC
		LIMIT ? OFFSET ?`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := []models.AdminFeedback{}
	for rows.Next() {
		var a models.AdminFeedback
		var replied sql.NullTime
		var unread int
		if err := rows.Scan(&a.ID, &a.Type, &a.Message, &a.Status, &a.AdminReply, &replied, &unread,
			&a.PagePath, &a.UserAgent, &a.User.ID, &a.User.Username, &a.User.Email, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		if replied.Valid {
			t := replied.Time
			a.RepliedAt = &t
		}
		a.ReplyUnread = unread == 1
		list = append(list, a)
	}
	return list, total, rows.Err()
}

// AdminUpdate sets the status and/or the reply. A nil pointer leaves that
// field alone. A reply that differs from the stored one is stamped with the
// time and flagged unread for the user; an empty reply removes it; saving
// identical text changes nothing, so it cannot re-notify the user.
func (r *FeedbackRepo) AdminUpdate(ctx context.Context, id int64, status, reply *string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var current sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT admin_reply FROM feedback WHERE id = ? FOR UPDATE`, id).Scan(&current)
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if status != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE feedback SET status = ? WHERE id = ?`, *status, id); err != nil {
			return err
		}
	}
	if reply != nil && *reply != current.String {
		if *reply == "" {
			_, err = tx.ExecContext(ctx,
				`UPDATE feedback SET admin_reply = NULL, replied_at = NULL, reply_unread = 0 WHERE id = ?`, id)
		} else {
			_, err = tx.ExecContext(ctx,
				`UPDATE feedback SET admin_reply = ?, replied_at = NOW(), reply_unread = 1 WHERE id = ?`, *reply, id)
		}
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run the `go test` command from Step 4 again.
Expected: all 5 `TestFeedbackRepo*` tests PASS, and none reports SKIP.

- [ ] **Step 7: Run the whole package without the DSN, to confirm existing tests still pass and the new ones skip**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 sh -c 'go vet ./... && go test ./internal/repository/'
```
Expected: `ok  final-review/be/internal/repository`.

- [ ] **Step 8: Commit**

```bash
git add be/migrations/016_feedback.sql be/internal/models/feedback.go be/internal/repository/feedback.go be/internal/repository/feedback_integration_test.go
git commit -m "feat(feedback): feedback table, models and repository

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: HTTP handlers, routes, and the stats count

**Files:**
- Modify: `be/internal/handlers/response.go` (add `writeErrorCode` after `writeError`)
- Create: `be/internal/handlers/feedback.go`
- Create: `be/internal/handlers/feedback_admin.go`
- Test: `be/internal/handlers/feedback_test.go`
- Modify: `be/internal/router/router.go`
- Modify: `be/internal/handlers/admin.go` (`Stats`)

**Interfaces:**
- Consumes: Task 1 (`ratelimit.New`), Task 2 (`mw.RateLimitPerUser`, `middleware.WithUserID`), Task 3 (every `feedback.*` name), and Task 4 (the `repository.FeedbackRepo` methods, `repository.NewFeedback`, `repository.FeedbackFilter`, and `models.*`)
- Produces. These HTTP endpoints are what Tasks 6–8 call:
  - `POST /api/v1/feedback` takes `{type, message, page_path?}` and returns 201 with a `models.Feedback`
  - `GET /api/v1/feedback/mine` returns `{"data": models.Feedback[]}`
  - `GET /api/v1/feedback/mine/unread` returns `{"count": n}`
  - `POST /api/v1/feedback/mine/seen` returns 204
  - `GET /api/v1/admin/feedback?status=&type=&limit=&offset=` returns `{"data": models.AdminFeedback[], "total": n}`
  - `PATCH /api/v1/admin/feedback/{id}` takes `{status?, admin_reply?}` and returns `{"ok": true}`
  - `GET /api/v1/admin/stats` gains `new_feedback`

- [ ] **Step 1: Add `writeErrorCode`**

In `be/internal/handlers/response.go`, add this after `writeError`:

```go
// writeErrorCode writes an error carrying a stable machine-readable code next
// to the English sentence, for clients that show their own translated message.
func writeErrorCode(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": msg, "code": code})
}
```

- [ ] **Step 2: Write the failing handler tests**

Create `be/internal/handlers/feedback_test.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"final-review/be/internal/feedback"
	"final-review/be/internal/middleware"
	"final-review/be/internal/models"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

type fakeFeedbackStore struct {
	spam, dup, open int
	created         []repository.NewFeedback
	filter          repository.FeedbackFilter
	updateErr       error
	updatedID       int64
	updatedStatus   *string
	updatedReply    *string
}

func (f *fakeFeedbackStore) AdmissionCounts(context.Context, int64, string) (int, int, int, error) {
	return f.spam, f.dup, f.open, nil
}

func (f *fakeFeedbackStore) Create(_ context.Context, in repository.NewFeedback) (*models.Feedback, error) {
	f.created = append(f.created, in)
	return &models.Feedback{ID: 1, Type: in.Type, Message: in.Message, Status: "new"}, nil
}

func (f *fakeFeedbackStore) ListMine(context.Context, int64, int) ([]models.Feedback, error) {
	return []models.Feedback{}, nil
}

func (f *fakeFeedbackStore) UnreadCount(context.Context, int64) (int, error) { return 0, nil }

func (f *fakeFeedbackStore) MarkSeen(context.Context, int64) error { return nil }

func (f *fakeFeedbackStore) AdminList(_ context.Context, flt repository.FeedbackFilter) ([]models.AdminFeedback, int, error) {
	f.filter = flt
	return []models.AdminFeedback{}, 0, nil
}

func (f *fakeFeedbackStore) AdminUpdate(_ context.Context, id int64, status, reply *string) error {
	f.updatedID, f.updatedStatus, f.updatedReply = id, status, reply
	return f.updateErr
}

func postFeedback(store *fakeFeedbackStore, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/feedback", strings.NewReader(body))
	req.Header.Set("User-Agent", "TestBrowser/1.0")
	req = req.WithContext(middleware.WithUserID(req.Context(), 42))
	rec := httptest.NewRecorder()
	NewFeedbackHandler(store).Create(rec, req)
	return rec
}

func errCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return body.Code
}

const okMessage = "The checkout button does nothing on my phone."

func TestFeedbackCreateRejects(t *testing.T) {
	valid := `{"type":"bug","message":"` + okMessage + `"}`
	cases := []struct {
		name       string
		body       string
		store      fakeFeedbackStore
		wantStatus int
		wantCode   string
	}{
		{"not json", `hello`, fakeFeedbackStore{}, 400, feedback.CodeInvalidBody},
		{"body over 16 KB", `{"type":"bug","message":"` + strings.Repeat("a", 17<<10) + `"}`, fakeFeedbackStore{}, 400, feedback.CodeInvalidBody},
		{"unknown type", `{"type":"rant","message":"` + okMessage + `"}`, fakeFeedbackStore{}, 400, feedback.CodeInvalidType},
		{"too short", `{"type":"bug","message":"broken"}`, fakeFeedbackStore{}, 400, feedback.CodeTooShort},
		{"low effort", `{"type":"bug","message":"aaaaaaaaaaaaaaaaaaaaaaaaa"}`, fakeFeedbackStore{}, 400, feedback.CodeLowEffort},
		{"paused", valid, fakeFeedbackStore{spam: 3}, 403, feedback.CodePaused},
		{"duplicate", valid, fakeFeedbackStore{dup: 1}, 409, feedback.CodeDuplicate},
		{"too many open", valid, fakeFeedbackStore{open: 10}, 429, feedback.CodeTooManyOpen},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			store := c.store
			rec := postFeedback(&store, c.body)
			if rec.Code != c.wantStatus {
				t.Fatalf("status = %d, want %d (body %s)", rec.Code, c.wantStatus, rec.Body)
			}
			if got := errCode(t, rec); got != c.wantCode {
				t.Errorf("code = %q, want %q", got, c.wantCode)
			}
			if len(store.created) != 0 {
				t.Errorf("stored %d items, want none", len(store.created))
			}
		})
	}
}

func TestFeedbackCreateStoresCleanedSubmission(t *testing.T) {
	store := &fakeFeedbackStore{}
	rec := postFeedback(store, `{"type":"bug","message":"  `+okMessage+`\r\n\r\n\r\nPlease fix  ","page_path":"/review/12"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body %s)", rec.Code, rec.Body)
	}
	if len(store.created) != 1 {
		t.Fatalf("stored %d items, want 1", len(store.created))
	}
	got := store.created[0]
	wantMsg := okMessage + "\n\nPlease fix"
	if got.UserID != 42 || got.Type != "bug" || got.Message != wantMsg {
		t.Errorf("stored %+v, want user 42's cleaned bug report", got)
	}
	if got.Hash != feedback.Fingerprint(wantMsg) {
		t.Error("hash is not the fingerprint of the cleaned message")
	}
	if got.PagePath != "/review/12" || got.UserAgent != "TestBrowser/1.0" {
		t.Errorf("context = %q / %q, want /review/12 and TestBrowser/1.0", got.PagePath, got.UserAgent)
	}
}

func TestFeedbackCreateDropsUnsafePagePath(t *testing.T) {
	store := &fakeFeedbackStore{}
	rec := postFeedback(store, `{"type":"idea","message":"`+okMessage+`","page_path":"https://evil.example/"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201: a bad page path is dropped, not an error", rec.Code)
	}
	if p := store.created[0].PagePath; p != "" {
		t.Errorf("stored page path %q, want empty", p)
	}
}

func patchFeedback(store *fakeFeedbackStore, id, body string) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Patch("/admin/feedback/{id}", NewFeedbackHandler(store).AdminUpdate)
	req := httptest.NewRequest(http.MethodPatch, "/admin/feedback/"+id, strings.NewReader(body))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestFeedbackAdminUpdate(t *testing.T) {
	t.Run("unknown status", func(t *testing.T) {
		rec := patchFeedback(&fakeFeedbackStore{}, "7", `{"status":"closed"}`)
		if rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidStatus {
			t.Fatalf("status = %d, want 400 invalid_status", rec.Code)
		}
	})
	t.Run("reply too long", func(t *testing.T) {
		rec := patchFeedback(&fakeFeedbackStore{}, "7", `{"admin_reply":"`+strings.Repeat("a", feedback.MaxReply+1)+`"}`)
		if rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidReply {
			t.Fatalf("status = %d, want 400 invalid_reply", rec.Code)
		}
	})
	t.Run("non-numeric id", func(t *testing.T) {
		if rec := patchFeedback(&fakeFeedbackStore{}, "abc", `{"status":"new"}`); rec.Code != 400 {
			t.Fatalf("status = %d, want 400", rec.Code)
		}
	})
	t.Run("unknown id", func(t *testing.T) {
		rec := patchFeedback(&fakeFeedbackStore{updateErr: repository.ErrNotFound}, "7", `{"status":"new"}`)
		if rec.Code != 404 {
			t.Fatalf("status = %d, want 404", rec.Code)
		}
	})
	t.Run("status and cleaned reply reach the store", func(t *testing.T) {
		store := &fakeFeedbackStore{}
		rec := patchFeedback(store, "7", `{"status":"resolved","admin_reply":"  Thanks, fixed.  "}`)
		if rec.Code != 200 {
			t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body)
		}
		if store.updatedID != 7 || store.updatedStatus == nil || *store.updatedStatus != "resolved" {
			t.Errorf("update id=%d status=%v, want 7 and resolved", store.updatedID, store.updatedStatus)
		}
		if store.updatedReply == nil || *store.updatedReply != "Thanks, fixed." {
			t.Errorf("reply = %v, want the trimmed text", store.updatedReply)
		}
	})
	t.Run("blank reply is passed on so it clears", func(t *testing.T) {
		store := &fakeFeedbackStore{}
		patchFeedback(store, "7", `{"admin_reply":"   "}`)
		if store.updatedReply == nil || *store.updatedReply != "" || store.updatedStatus != nil {
			t.Errorf("reply=%v status=%v, want an empty reply and no status change", store.updatedReply, store.updatedStatus)
		}
	})
}

func TestFeedbackAdminListFilters(t *testing.T) {
	list := func(store *fakeFeedbackStore, query string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/admin/feedback?"+query, nil)
		rec := httptest.NewRecorder()
		NewFeedbackHandler(store).AdminList(rec, req)
		return rec
	}

	if rec := list(&fakeFeedbackStore{}, "status=bogus"); rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidStatus {
		t.Errorf("status=bogus: %d, want 400 invalid_status", rec.Code)
	}
	if rec := list(&fakeFeedbackStore{}, "type=bogus"); rec.Code != 400 || errCode(t, rec) != feedback.CodeInvalidType {
		t.Errorf("type=bogus: %d, want 400 invalid_type", rec.Code)
	}

	store := &fakeFeedbackStore{}
	if rec := list(store, "status=new&type=bug&limit=1000&offset=-5"); rec.Code != 200 {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	want := repository.FeedbackFilter{Status: "new", Type: "bug", Limit: 100, Offset: 0}
	if store.filter != want {
		t.Errorf("filter = %+v, want %+v (limit capped, offset floored)", store.filter, want)
	}

	store = &fakeFeedbackStore{}
	list(store, "")
	if want := (repository.FeedbackFilter{Limit: 50}); store.filter != want {
		t.Errorf("default filter = %+v, want %+v", store.filter, want)
	}
}
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 go test ./internal/handlers/ -run Feedback -v
```
Expected: FAIL to compile: `undefined: NewFeedbackHandler`.

- [ ] **Step 4: Write the user endpoints**

Create `be/internal/handlers/feedback.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"final-review/be/internal/feedback"
	"final-review/be/internal/middleware"
	"final-review/be/internal/models"
	"final-review/be/internal/repository"
)

// feedbackStore is what FeedbackHandler needs from storage.
// *repository.FeedbackRepo satisfies it; it is an interface so the HTTP
// contract can be tested without MySQL.
type feedbackStore interface {
	AdmissionCounts(ctx context.Context, userID int64, hash string) (spam, dup, open int, err error)
	Create(ctx context.Context, in repository.NewFeedback) (*models.Feedback, error)
	ListMine(ctx context.Context, userID int64, limit int) ([]models.Feedback, error)
	UnreadCount(ctx context.Context, userID int64) (int, error)
	MarkSeen(ctx context.Context, userID int64) error
	AdminList(ctx context.Context, f repository.FeedbackFilter) ([]models.AdminFeedback, int, error)
	AdminUpdate(ctx context.Context, id int64, status, reply *string) error
}

type FeedbackHandler struct {
	store feedbackStore
}

func NewFeedbackHandler(store feedbackStore) *FeedbackHandler {
	return &FeedbackHandler{store: store}
}

const (
	maxFeedbackBody = 16 << 10 // bytes
	mineLimit       = 50
)

// feedbackErrors maps each client-facing code to its HTTP status and English
// sentence. The frontend shows its own translation keyed by the code; the
// sentence is for other API consumers and for logs.
var feedbackErrors = map[string]struct {
	status int
	msg    string
}{
	feedback.CodeInvalidBody:   {http.StatusBadRequest, "request body must be JSON under 16 KB"},
	feedback.CodeInvalidType:   {http.StatusBadRequest, "type must be one of bug, idea, complaint, praise, other"},
	feedback.CodeTooShort:      {http.StatusBadRequest, "message must be at least 20 characters"},
	feedback.CodeTooLong:       {http.StatusBadRequest, "message must be at most 2000 characters"},
	feedback.CodeLowEffort:     {http.StatusBadRequest, "message needs more than a repeated character or two"},
	feedback.CodeTooManyLinks:  {http.StatusBadRequest, "message may contain at most 2 links"},
	feedback.CodePaused:        {http.StatusForbidden, "feedback is paused for this account"},
	feedback.CodeDuplicate:     {http.StatusConflict, "you already sent this feedback"},
	feedback.CodeTooManyOpen:   {http.StatusTooManyRequests, "too many open feedback items"},
	feedback.CodeInvalidStatus: {http.StatusBadRequest, "status must be one of new, in_progress, resolved, spam"},
	feedback.CodeInvalidReply:  {http.StatusBadRequest, "reply must be at most 2000 characters"},
}

func writeFeedbackError(w http.ResponseWriter, code string) {
	e := feedbackErrors[code]
	writeErrorCode(w, e.status, code, e.msg)
}

// Create stores one feedback item. It sits behind Auth and
// RateLimitPerUser(feedback.RateRules), so timing limits are already checked
// by the time it runs; every rejection here answers 4xx, which refunds the
// user's rate-limit slot.
func (h *FeedbackHandler) Create(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxFeedbackBody)
	var body struct {
		Type     string `json:"type"`
		Message  string `json:"message"`
		PagePath string `json:"page_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeFeedbackError(w, feedback.CodeInvalidBody)
		return
	}
	if !feedback.ValidType(body.Type) {
		writeFeedbackError(w, feedback.CodeInvalidType)
		return
	}
	message, code := feedback.Validate(body.Message)
	if code != "" {
		writeFeedbackError(w, code)
		return
	}

	ctx := r.Context()
	userID := middleware.UserIDFromCtx(ctx)
	hash := feedback.Fingerprint(message)
	spam, dup, open, err := h.store.AdmissionCounts(ctx, userID, hash)
	if err != nil {
		log.Printf("ERROR feedback admission user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to send feedback")
		return
	}
	if code := feedback.Admission(spam, dup, open); code != "" {
		writeFeedbackError(w, code)
		return
	}

	item, err := h.store.Create(ctx, repository.NewFeedback{
		UserID:    userID,
		Type:      body.Type,
		Message:   message,
		Hash:      hash,
		PagePath:  feedback.CleanPagePath(body.PagePath),
		UserAgent: feedback.CleanUserAgent(r.UserAgent()),
	})
	if err != nil {
		log.Printf("ERROR feedback create user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to send feedback")
		return
	}
	writeJSON(w, http.StatusCreated, item)
}

// Mine lists the caller's own feedback, newest first.
func (h *FeedbackHandler) Mine(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	list, err := h.store.ListMine(r.Context(), userID, mineLimit)
	if err != nil {
		log.Printf("ERROR feedback list user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// Unread counts the caller's replies not yet seen; it drives the header dot.
func (h *FeedbackHandler) Unread(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	n, err := h.store.UnreadCount(r.Context(), userID)
	if err != nil {
		log.Printf("ERROR feedback unread user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": n})
}

// MarkSeen clears the unread flag on the caller's replies.
func (h *FeedbackHandler) MarkSeen(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	if err := h.store.MarkSeen(r.Context(), userID); err != nil {
		log.Printf("ERROR feedback seen user=%d: %v", userID, err)
		writeError(w, http.StatusInternalServerError, "failed to update feedback")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 5: Write the admin endpoints**

Create `be/internal/handlers/feedback_admin.go`:

```go
package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"final-review/be/internal/feedback"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
)

// AdminList serves the CMS inbox. An empty status or type means no filter; an
// unknown value is a 400 rather than a silently empty page.
func (h *FeedbackHandler) AdminList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := repository.FeedbackFilter{
		Status: q.Get("status"),
		Type:   q.Get("type"),
		Limit:  min(max(queryInt(r, "limit", 50), 1), 100),
		Offset: max(queryInt(r, "offset", 0), 0),
	}
	if f.Status != "" && !feedback.ValidStatus(f.Status) {
		writeFeedbackError(w, feedback.CodeInvalidStatus)
		return
	}
	if f.Type != "" && !feedback.ValidType(f.Type) {
		writeFeedbackError(w, feedback.CodeInvalidType)
		return
	}
	list, total, err := h.store.AdminList(r.Context(), f)
	if err != nil {
		log.Printf("ERROR admin feedback list: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list, "total": total})
}

// AdminUpdate sets an item's status and/or its reply to the user.
func (h *FeedbackHandler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxFeedbackBody)
	var body struct {
		Status     *string `json:"status"`
		AdminReply *string `json:"admin_reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeFeedbackError(w, feedback.CodeInvalidBody)
		return
	}
	if body.Status != nil && !feedback.ValidStatus(*body.Status) {
		writeFeedbackError(w, feedback.CodeInvalidStatus)
		return
	}
	if body.AdminReply != nil {
		reply, code := feedback.CleanReply(*body.AdminReply)
		if code != "" {
			writeFeedbackError(w, code)
			return
		}
		body.AdminReply = &reply
	}

	err = h.store.AdminUpdate(r.Context(), id, body.Status, body.AdminReply)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "feedback not found")
		return
	}
	if err != nil {
		log.Printf("ERROR admin feedback update id=%d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to update feedback")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
```

- [ ] **Step 6: Run the handler tests to verify they pass**

Run the command from Step 3.
Expected: `TestFeedbackCreateRejects` (8 subtests), `TestFeedbackCreateStoresCleanedSubmission`, `TestFeedbackCreateDropsUnsafePagePath`, `TestFeedbackAdminUpdate` (6 subtests), and `TestFeedbackAdminListFilters` all PASS.

- [ ] **Step 7: Wire the routes**

In `be/internal/router/router.go`:

1. Add two imports to the import block:
   ```go
   	"final-review/be/internal/feedback"
   	"final-review/be/internal/ratelimit"
   ```
2. After the line `embedRepo := repository.NewEmbedRepo(db, cfg.SiteURL)`, add:
   ```go
   	feedbackRepo := repository.NewFeedbackRepo(db)
   ```
3. After the line `rewardsSvc := rewards.NewService(db)`, add:
   ```go

   	// rate limiting — per-user sliding windows in Redis
   	limiter := ratelimit.New(rdb)
   ```
4. After the line `widgetH := handlers.NewWidgetHandler(embedRepo)`, add:
   ```go
   	feedbackH := handlers.NewFeedbackHandler(feedbackRepo)
   ```
5. In the authenticated group, after the line `r.Post("/reviews/{id}/comments/{comment_id}/like", commentH.LikeComment)`, add:
   ```go

   			r.With(mw.RateLimitPerUser(limiter, "feedback", feedback.RateRules...)).Post("/feedback", feedbackH.Create)
   			r.Get("/feedback/mine", feedbackH.Mine)
   			r.Get("/feedback/mine/unread", feedbackH.Unread)
   			r.Post("/feedback/mine/seen", feedbackH.MarkSeen)
   ```
6. In the admin group, after the line `r.Patch("/admin/embeds/{id}", adminH.UpdateEmbed)`, add:
   ```go

   			r.Get("/admin/feedback", feedbackH.AdminList)
   			r.Patch("/admin/feedback/{id}", feedbackH.AdminUpdate)
   ```

- [ ] **Step 8: Count new feedback in the admin stats**

In `be/internal/handlers/admin.go`, in `Stats`, after the two lines that declare and scan `pendingEmbeds`, add:

```go
	var newFeedback int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM feedback WHERE status = 'new'`).Scan(&newFeedback)
```

In the same function's response map, after `"pending_embeds":   pendingEmbeds,`, add:

```go
		"new_feedback":     newFeedback,
```

Run `gofmt` (Step 9 does this) so the map's alignment matches.

- [ ] **Step 9: Format, vet, and run the whole backend suite against both throwaway stores**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 sh -c 'gofmt -l . ; go vet ./... && go build ./...'
```
Expected: `gofmt -l` prints nothing, and vet and build succeed. If `gofmt -l` lists a file, run `gofmt -w <file>` through the same container and repeat.

The Redis and MySQL containers each have their own network namespace, and one Go container can join only one of them. So run the suite twice:

```bash
docker run --rm --network container:fb-redis-test -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app \
  -e REDIS_TEST_ADDR=127.0.0.1:6379 golang:1.22 go test ./...
docker run --rm --network container:fb-mysql-test -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app \
  -e MYSQL_TEST_DSN='root:test@tcp(127.0.0.1:3306)/feedback_test?parseTime=true&loc=UTC' golang:1.22 go test ./...
```
Expected: every package is `ok` in both runs.

- [ ] **Step 10: Commit**

```bash
git add be/internal/handlers/response.go be/internal/handlers/feedback.go be/internal/handlers/feedback_admin.go \
  be/internal/handlers/feedback_test.go be/internal/handlers/admin.go be/internal/router/router.go
git commit -m "feat(feedback): user and admin endpoints behind the per-user rate limit

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend — `/feedback` page, form, and translations

**Files:**
- Modify: `fe/src/lib/api.ts` (add `ApiError`; throw it for non-2xx answers)
- Create: `fe/src/lib/feedbackApi.ts`
- Create: `fe/src/lib/feedbackRules.ts`
- Create: `fe/src/lib/feedbackDisplay.ts`
- Create: `fe/src/components/FeedbackForm.tsx`
- Create: `fe/src/pages/Feedback.tsx`
- Modify: `fe/src/App.tsx` (route)
- Modify: `fe/src/locales/en/translation.json`, `fe/src/locales/bn/translation.json` (the whole `feedback` block, including the strings Task 7 uses)

**Interfaces:**
- Consumes: the endpoints from Task 5. The error body's `code` and `retry_after`.
- Produces. Task 7 uses these:
  - `ApiError` from `@/lib/api`, with `status: number`, `code?: string`, `retryAfter?: number`
  - `FEEDBACK_TYPES`, `FeedbackType`, `FeedbackStatus`, `FeedbackItem`, and `feedbackApi.{create, mine, unread, markSeen}` from `@/lib/feedbackApi`
  - `FEEDBACK_TYPE_ICON` and `FEEDBACK_STATUS_CLASS` from `@/lib/feedbackDisplay`
  - i18n keys under `feedback.*`, listed in Step 1
  - The React Query keys `["feedback-mine", userId]` and `["feedback-unread", userId]`. Invalidate them by the prefixes `["feedback-mine"]` and `["feedback-unread"]`.

There is no frontend test runner. Each step is verified with `npx tsc --noEmit -p tsconfig.app.json`, and the behaviour is checked in Task 9.

- [ ] **Step 1: Add the translations**

Run this from the worktree root. It rewrites both files with the same formatting they have today; they round-trip byte-for-byte through `json.dumps(indent=2, ensure_ascii=False)`.

```bash
python3 - <<'PY'
import json

EN = {
  "pageTitle": "Send feedback",
  "pageSubtitle": "Found a bug, have an idea, or is something bothering you? Tell us. A person reads every message.",
  "typeLabel": "What kind of feedback?",
  "types": {"bug": "Bug", "idea": "Idea", "complaint": "Complaint", "praise": "Praise", "other": "Other"},
  "messageLabel": "Your message",
  "hints": {
    "bug": "What were you doing, and what went wrong?",
    "idea": "What would you like BdRanks to do, and how would it help?",
    "complaint": "What happened, and what would have been better?",
    "praise": "What did you like? We'll pass it on to the team.",
    "other": "Tell us what's on your mind."
  },
  "counter": "{{count, number}} / {{max, number}}",
  "submit": "Send feedback",
  "sending": "Sending…",
  "thanksTitle": "Thanks, we got it",
  "thanksBody": "Someone on our team will read it. If we reply, you'll see it on your profile.",
  "seeYours": "See your feedback",
  "sendAnother": "Send another",
  "errors": {
    "message_too_short": "Please write at least {{min, number}} characters so we can understand.",
    "message_too_long": "Please keep it under {{max, number}} characters.",
    "message_low_effort": "That doesn't look like a real message. Tell us what happened in a few words.",
    "too_many_links": "Please include at most {{max, number}} links.",
    "invalid_type": "Pick a feedback type.",
    "invalid_body": "Something went wrong with that message. Please try again.",
    "rate_limited": "You've sent feedback recently. You can send more in {{wait}}.",
    "duplicate": "You already sent us this message. We have it, so there's no need to send it again.",
    "too_many_open": "You have {{max, number}} open items waiting for us. You can send more once we've handled some.",
    "paused": "Feedback is paused on your account for now.",
    "rate_limit_unavailable": "We couldn't send that right now. Please try again in a moment.",
    "network": "Couldn't send your feedback. Check your connection and try again."
  },
  "wait": {
    "seconds_one": "{{count, number}} second", "seconds_other": "{{count, number}} seconds",
    "minutes_one": "{{count, number}} minute", "minutes_other": "{{count, number}} minutes",
    "hours_one": "{{count, number}} hour", "hours_other": "{{count, number}} hours"
  },
  "status": {"new": "New", "in_progress": "In progress", "resolved": "Resolved", "closed": "Closed"},
  "myTitle": "My feedback",
  "myEmpty": "You haven't sent any feedback yet.",
  "newReply": "New reply",
  "replyFrom": "Reply from BdRanks",
  "navLink": "Send feedback",
  "unreadLabel": "You have a new reply to your feedback"
}

BN = {
  "pageTitle": "মতামত পাঠান",
  "pageSubtitle": "কোনো সমস্যা পেয়েছেন, নতুন আইডিয়া আছে, বা কিছু ভালো লাগছে না? আমাদের জানান। প্রতিটি মেসেজ একজন মানুষ পড়েন।",
  "typeLabel": "কী ধরনের মতামত?",
  "types": {"bug": "সমস্যা", "idea": "আইডিয়া", "complaint": "অভিযোগ", "praise": "প্রশংসা", "other": "অন্যান্য"},
  "messageLabel": "আপনার মেসেজ",
  "hints": {
    "bug": "আপনি কী করছিলেন, আর কী ভুল হলো?",
    "idea": "BdRanks-এ কী দেখতে চান, আর সেটা কীভাবে কাজে লাগবে?",
    "complaint": "কী হয়েছিল, আর কী হলে ভালো হতো?",
    "praise": "কী ভালো লেগেছে? আমরা টিমকে জানিয়ে দেব।",
    "other": "যা মনে আছে, লিখে ফেলুন।"
  },
  "counter": "{{count, number}} / {{max, number}}",
  "submit": "মতামত পাঠান",
  "sending": "পাঠানো হচ্ছে…",
  "thanksTitle": "ধন্যবাদ, আমরা পেয়েছি",
  "thanksBody": "আমাদের টিমের একজন এটা পড়বেন। উত্তর দিলে আপনার প্রোফাইলে দেখতে পাবেন।",
  "seeYours": "আপনার মতামত দেখুন",
  "sendAnother": "আরেকটি পাঠান",
  "errors": {
    "message_too_short": "অন্তত {{min, number}} অক্ষর লিখুন, যাতে আমরা বুঝতে পারি।",
    "message_too_long": "অনুগ্রহ করে {{max, number}} অক্ষরের মধ্যে রাখুন।",
    "message_low_effort": "এটা আসল মেসেজ মনে হচ্ছে না। কী হয়েছে, কয়েকটা শব্দে লিখুন।",
    "too_many_links": "সর্বোচ্চ {{max, number}}টি লিংক দিতে পারবেন।",
    "invalid_type": "মতামতের ধরন বেছে নিন।",
    "invalid_body": "মেসেজটিতে কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।",
    "rate_limited": "আপনি সম্প্রতি মতামত পাঠিয়েছেন। {{wait}} পর আবার পাঠাতে পারবেন।",
    "duplicate": "এই মেসেজটি আপনি আগেই পাঠিয়েছেন। আমরা পেয়েছি, আবার পাঠানোর দরকার নেই।",
    "too_many_open": "আপনার {{max, number}}টি মতামত এখনো আমাদের কাছে অপেক্ষায় আছে। কয়েকটির সমাধান হলে আবার পাঠাতে পারবেন।",
    "paused": "আপাতত আপনার অ্যাকাউন্ট থেকে মতামত পাঠানো বন্ধ আছে।",
    "rate_limit_unavailable": "এই মুহূর্তে পাঠানো যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
    "network": "মতামত পাঠানো যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।"
  },
  "wait": {
    "seconds_one": "{{count, number}} সেকেন্ড", "seconds_other": "{{count, number}} সেকেন্ড",
    "minutes_one": "{{count, number}} মিনিট", "minutes_other": "{{count, number}} মিনিট",
    "hours_one": "{{count, number}} ঘণ্টা", "hours_other": "{{count, number}} ঘণ্টা"
  },
  "status": {"new": "নতুন", "in_progress": "কাজ চলছে", "resolved": "সমাধান হয়েছে", "closed": "বন্ধ"},
  "myTitle": "আমার মতামত",
  "myEmpty": "আপনি এখনো কোনো মতামত পাঠাননি।",
  "newReply": "নতুন উত্তর",
  "replyFrom": "BdRanks-এর উত্তর",
  "navLink": "মতামত পাঠান",
  "unreadLabel": "আপনার মতামতের একটি নতুন উত্তর এসেছে"
}

for path, block in (("fe/src/locales/en/translation.json", EN), ("fe/src/locales/bn/translation.json", BN)):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["feedback"] = block
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print("ok")
PY
git diff --stat fe/src/locales/
```
Expected: `ok`. `git diff fe/src/locales/` should show the new `feedback` block appended at the end of each file, and one modified line: the closing `}` of the previous last block (`video`) gains a trailing comma. If any other line changed, stop and restore the files with `git checkout -- fe/src/locales/`, because the formatting round-trip no longer holds.

`{{count, number}}` uses i18next's built-in number formatter, which formats with the active language. Bangla therefore renders digits as ৪২.

- [ ] **Step 2: Make `apiFetch` expose error codes**

In `fe/src/lib/api.ts`, add this class directly above `export interface ApiFetchOptions`:

```ts
/**
 * A non-2xx answer from the API. `code` and `retryAfter` are set by endpoints
 * that return machine-readable errors (feedback, for one), so callers can show
 * a translated message. Everything else only has `message`, exactly as before.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;
  constructor(message: string, status: number, code?: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
```

Then, in `apiFetch`, replace:

```ts
  if (!res.ok) {
    throw new Error(data.error ?? "Request failed");
  }
```

with:

```ts
  if (!res.ok) {
    throw new ApiError(data.error ?? "Request failed", res.status, data.code, data.retry_after);
  }
```

`ApiError` extends `Error`, so every existing caller that reads `err.message` behaves the same.

- [ ] **Step 3: Add the API module, the client rules, and the display maps**

Create `fe/src/lib/feedbackApi.ts`:

```ts
import { apiFetch } from "@/lib/api";

export const FEEDBACK_TYPES = ["bug", "idea", "complaint", "praise", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** The status a user sees. The server reports spam as "closed". */
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "closed";

export interface FeedbackItem {
  id: number;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  /** "" when there is no reply. */
  admin_reply: string;
  replied_at: string | null;
  reply_unread: boolean;
  created_at: string;
}

export const feedbackApi = {
  create: (t: string | null, body: { type: FeedbackType; message: string; page_path?: string }) =>
    apiFetch<FeedbackItem>("/feedback", { method: "POST", body: JSON.stringify(body) }, t),
  mine: (t: string | null) =>
    apiFetch<{ data: FeedbackItem[] | null }>("/feedback/mine", {}, t).then((r) => r.data ?? []),
  // The header polls this on every page, so a stale session must never bounce
  // the visitor to sign-in from here.
  unread: (t: string | null) =>
    apiFetch<{ count: number }>("/feedback/mine/unread", {}, t, { redirectOn401: false }).then((r) => r.count),
  markSeen: (t: string | null) => apiFetch<void>("/feedback/mine/seen", { method: "POST" }, t),
};
```

Create `fe/src/lib/feedbackRules.ts`:

```ts
// Mirrors be/internal/feedback/feedback.go so most mistakes are caught while
// typing. The server re-checks everything and has the final say, so keep
// these numbers in step with it.

export const FEEDBACK_MIN = 20;
export const FEEDBACK_MAX = 2000;
export const FEEDBACK_MAX_LINKS = 2;
export const FEEDBACK_MAX_OPEN = 10;
const MIN_DISTINCT = 6;

// A scheme or "www." followed by non-space characters, so "https://www.x.com" is one link.
const LINK = /(?:https?:\/\/|www\.)\S+/gi;

export type FeedbackRuleCode =
  | "message_too_short"
  | "message_too_long"
  | "message_low_effort"
  | "too_many_links";

/** Characters as the server counts them: code points, not UTF-16 units. */
export const charCount = (s: string) => [...s.trim()].length;

export function checkFeedbackMessage(message: string): FeedbackRuleCode | null {
  const m = message.trim();
  const n = [...m].length;
  if (n < FEEDBACK_MIN) return "message_too_short";
  if (n > FEEDBACK_MAX) return "message_too_long";
  if (new Set([...m].filter((ch) => !/\s/.test(ch))).size < MIN_DISTINCT) return "message_low_effort";
  if ((m.match(LINK) ?? []).length > FEEDBACK_MAX_LINKS) return "too_many_links";
  return null;
}
```

Create `fe/src/lib/feedbackDisplay.ts`:

```ts
import { AlertCircle, Bug, Heart, Lightbulb, MessageCircle, type LucideIcon } from "lucide-react";
import type { FeedbackStatus, FeedbackType } from "@/lib/feedbackApi";

export const FEEDBACK_TYPE_ICON: Record<FeedbackType, LucideIcon> = {
  bug: Bug,
  idea: Lightbulb,
  complaint: AlertCircle,
  praise: Heart,
  other: MessageCircle,
};

/** Badge colours per status, in the style of the profile's pending badge. */
export const FEEDBACK_STATUS_CLASS: Record<FeedbackStatus, string> = {
  new: "text-sky-700 border-sky-200 bg-sky-50",
  in_progress: "text-amber-700 border-amber-200 bg-amber-50",
  resolved: "text-emerald-700 border-emerald-200 bg-emerald-50",
  closed: "text-muted-foreground border-border bg-muted/40",
};
```

- [ ] **Step 4: Write the form**

Create `fe/src/components/FeedbackForm.tsx`:

```tsx
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FEEDBACK_TYPES, feedbackApi, type FeedbackType } from "@/lib/feedbackApi";
import { FEEDBACK_TYPE_ICON } from "@/lib/feedbackDisplay";
import {
  FEEDBACK_MAX,
  FEEDBACK_MAX_LINKS,
  FEEDBACK_MAX_OPEN,
  FEEDBACK_MIN,
  charCount,
  checkFeedbackMessage,
} from "@/lib/feedbackRules";

/** A rate-limit wait in the largest sensible unit, with localized digits. */
function waitText(t: TFunction, seconds: number) {
  if (seconds < 60) return t("feedback.wait.seconds", { count: seconds });
  if (seconds < 3600) return t("feedback.wait.minutes", { count: Math.ceil(seconds / 60) });
  return t("feedback.wait.hours", { count: Math.ceil(seconds / 3600) });
}

/** The translated message for an error code from the client rules or the server. */
function errorText(t: TFunction, code: string, retryAfter?: number) {
  switch (code) {
    case "message_too_short":
      return t("feedback.errors.message_too_short", { min: FEEDBACK_MIN });
    case "message_too_long":
      return t("feedback.errors.message_too_long", { max: FEEDBACK_MAX });
    case "too_many_links":
      return t("feedback.errors.too_many_links", { max: FEEDBACK_MAX_LINKS });
    case "too_many_open":
      return t("feedback.errors.too_many_open", { max: FEEDBACK_MAX_OPEN });
    case "rate_limited":
      return t("feedback.errors.rate_limited", { wait: waitText(t, retryAfter ?? 60) });
    case "message_low_effort":
    case "invalid_type":
    case "invalid_body":
    case "duplicate":
    case "paused":
    case "rate_limit_unavailable":
      return t(`feedback.errors.${code}`);
    default:
      return t("feedback.errors.network");
  }
}

/** Codes about the message text are shown under the textarea; the rest above the button. */
const MESSAGE_CODES = new Set(["message_too_short", "message_too_long", "message_low_effort", "too_many_links"]);

export function FeedbackForm() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const location = useLocation();
  // Entry links pass the page the user was on, so a bug report says where it happened.
  const from = (location.state as { from?: string } | null)?.from;

  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState("");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const count = charCount(message);

  const reset = () => {
    setType(null);
    setMessage("");
    setTypeError(null);
    setMessageError(null);
    setFormError(null);
    setSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setFormError(null);

    const typeErr = type ? null : t("feedback.errors.invalid_type");
    const ruleCode = checkFeedbackMessage(message);
    setTypeError(typeErr);
    setMessageError(ruleCode ? errorText(t, ruleCode) : null);
    if (typeErr) {
      document.getElementById("feedback-type-bug")?.focus();
      return;
    }
    if (ruleCode) {
      document.getElementById("feedback-message")?.focus();
      return;
    }

    setSending(true);
    try {
      await feedbackApi.create(token, { type: type!, message, page_path: from });
      qc.invalidateQueries({ queryKey: ["feedback-mine"] });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code) {
        const text = errorText(t, err.code, err.retryAfter);
        if (MESSAGE_CODES.has(err.code)) setMessageError(text);
        else setFormError(text);
      } else {
        toast({ title: t("feedback.errors.network"), variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-6" role="status">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">{t("feedback.thanksTitle")}</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t("feedback.thanksBody")}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="hero" className="rounded-full px-6">
            <Link to="/profile#my-feedback">{t("feedback.seeYours")}</Link>
          </Button>
          <Button variant="outline" className="rounded-full px-6" onClick={reset}>
            {t("feedback.sendAnother")}
          </Button>
        </div>
      </div>
    );
  }

  const hint = t(`feedback.hints.${type ?? "other"}`);

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-foreground mb-3">{t("feedback.typeLabel")}</legend>
        <div className="flex flex-wrap gap-2" aria-describedby={typeError ? "feedback-type-error" : undefined}>
          {FEEDBACK_TYPES.map((key) => {
            const Icon = FEEDBACK_TYPE_ICON[key];
            const active = type === key;
            return (
              <button
                key={key}
                id={`feedback-type-${key}`}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setType(key);
                  setTypeError(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(`feedback.types.${key}`)}
              </button>
            );
          })}
        </div>
        {typeError && (
          <p id="feedback-type-error" className="text-xs text-destructive mt-2">
            {typeError}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">{t("feedback.messageLabel")}</Label>
        <p id="feedback-message-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (messageError) setMessageError(null);
          }}
          aria-invalid={Boolean(messageError) || undefined}
          aria-describedby={messageError ? "feedback-message-error" : "feedback-message-hint feedback-message-count"}
          className={cn("min-h-[180px] bg-background", messageError && "border-destructive focus-visible:ring-destructive")}
        />
        <div className="flex items-start justify-between gap-3">
          {messageError ? (
            <p id="feedback-message-error" className="text-xs text-destructive">
              {messageError}
            </p>
          ) : (
            <span />
          )}
          <span
            id="feedback-message-count"
            className={cn("text-xs tabular-nums shrink-0", count > FEEDBACK_MAX ? "text-destructive" : "text-muted-foreground")}
          >
            {t("feedback.counter", { count, max: FEEDBACK_MAX })}
          </span>
        </div>
      </div>

      {formError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      <Button type="submit" variant="hero" className="w-full sm:w-auto rounded-full px-6" disabled={sending}>
        {sending ? t("feedback.sending") : t("feedback.submit")}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Write the page and add the route**

Create `fe/src/pages/Feedback.tsx`:

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useAuth } from "@/hooks/useAuth";

export default function Feedback() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <PageHead title={t("feedback.pageTitle")} description="Send feedback to the BdRanks team." noindex />
      <Header />

      <main className="container px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">{t("feedback.pageTitle")}</h1>
            <p className="text-muted-foreground">{t("feedback.pageSubtitle")}</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 md:p-8 shadow-elegant">
            {user ? <FeedbackForm /> : <div className="h-40 animate-pulse rounded-lg bg-muted/40" />}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
```

In `fe/src/App.tsx`, add `import Feedback from "./pages/Feedback";` after `import EmbedPage from "./pages/EmbedPage";`. Then add this route directly above the `<Route path="*"` line:

```tsx
            <Route path="/feedback" element={<Feedback />} />
```

- [ ] **Step 6: Type-check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json; cd ..
```
Expected: no output, and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add fe/src/lib/api.ts fe/src/lib/feedbackApi.ts fe/src/lib/feedbackRules.ts fe/src/lib/feedbackDisplay.ts \
  fe/src/components/FeedbackForm.tsx fe/src/pages/Feedback.tsx fe/src/App.tsx \
  fe/src/locales/en/translation.json fe/src/locales/bn/translation.json
git commit -m "feat(fe): feedback page with inline validation and localized limit messages

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — profile card, header dot, and entry links

**Files:**
- Create: `fe/src/hooks/useFeedbackUnread.ts`
- Create: `fe/src/components/MyFeedback.tsx`
- Modify: `fe/src/pages/Profile.tsx`
- Modify: `fe/src/components/Header.tsx`
- Modify: `fe/src/components/Footer.tsx`

**Interfaces:**
- Consumes: `feedbackApi`, `FeedbackItem`, `FEEDBACK_TYPE_ICON`, `FEEDBACK_STATUS_CLASS`, and the `feedback.*` i18n keys, all from Task 6
- Produces: `useFeedbackUnread(): number`, and the element `#my-feedback` that the thank-you link in Task 6 targets

- [ ] **Step 1: Write the unread hook**

Create `fe/src/hooks/useFeedbackUnread.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { feedbackApi } from "@/lib/feedbackApi";

/**
 * How many of the signed-in user's feedback items have a reply they haven't
 * seen yet. It drives the header dot. It is cached for a minute so moving
 * between pages doesn't refetch every time, and MyFeedback invalidates it
 * after marking replies read. A failure counts as zero: a missing dot must
 * never break the header.
 */
export function useFeedbackUnread(): number {
  const { user, token } = useAuth();
  const { data } = useQuery({
    queryKey: ["feedback-unread", user?.id],
    queryFn: () => feedbackApi.unread(token),
    enabled: Boolean(user && token),
    staleTime: 60_000,
    retry: false,
  });
  return user ? data ?? 0 : 0;
}
```

- [ ] **Step 2: Write the profile card**

Create `fe/src/components/MyFeedback.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { feedbackApi } from "@/lib/feedbackApi";
import { FEEDBACK_STATUS_CLASS, FEEDBACK_TYPE_ICON } from "@/lib/feedbackDisplay";

export function MyFeedback() {
  const { t, i18n } = useTranslation();
  const { user, token } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);

  const { data: items = [], isSuccess } = useQuery({
    queryKey: ["feedback-mine", user?.id],
    queryFn: () => feedbackApi.mine(token),
    enabled: Boolean(user && token),
  });

  // Seeing the list counts as reading the replies. The "New reply" badges come
  // from the data already loaded, so they stay visible for this visit.
  const hasUnread = items.some((item) => item.reply_unread);
  useEffect(() => {
    if (!isSuccess || !hasUnread) return;
    feedbackApi
      .markSeen(token)
      .then(() => qc.invalidateQueries({ queryKey: ["feedback-unread"] }))
      .catch(() => {
        /* the dot stays; the next visit retries */
      });
  }, [isSuccess, hasUnread, token, qc]);

  // Arriving from the form's "See your feedback" link (/profile#my-feedback).
  useEffect(() => {
    if (isSuccess && location.hash === "#my-feedback") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isSuccess, location.hash]);

  const locale = i18n.language === "bn" ? "bn-BD" : "en-US";

  return (
    <div
      id="my-feedback"
      ref={cardRef}
      className="mt-6 mb-8 scroll-mt-24 bg-card border border-border rounded-xl overflow-hidden shadow-soft"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
        <h2 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-primary" />
          {t("feedback.myTitle")}
        </h2>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/feedback" state={{ from: "/profile" }}>
            {t("feedback.navLink")}
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-10 text-center text-muted-foreground text-sm">{t("feedback.myEmpty")}</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const Icon = FEEDBACK_TYPE_ICON[item.type];
            return (
              <li key={item.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground/80">{t(`feedback.types.${item.type}`)}</span>
                  <span>·</span>
                  <span>{new Date(item.created_at).toLocaleDateString(locale)}</span>
                  <Badge variant="outline" className={cn("ml-auto text-xs", FEEDBACK_STATUS_CLASS[item.status])}>
                    {t(`feedback.status.${item.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words line-clamp-4">{item.message}</p>

                {item.admin_reply && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
                      <span className="font-semibold text-primary">{t("feedback.replyFrom")}</span>
                      {item.replied_at && (
                        <span className="text-muted-foreground">· {new Date(item.replied_at).toLocaleDateString(locale)}</span>
                      )}
                      {item.reply_unread && <Badge className="ml-auto text-[10px] px-1.5 py-0">{t("feedback.newReply")}</Badge>}
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">{item.admin_reply}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Put the card on the profile**

In `fe/src/pages/Profile.tsx`:

1. Add this import after the `ProfileCampaignBanners` import:
   ```tsx
   import { MyFeedback } from "@/components/MyFeedback";
   ```
2. On the "My Comments" card, replace
   `<div className="mt-6 mb-8 bg-card border border-border rounded-xl overflow-hidden shadow-soft">`
   with
   `<div className="mt-6 bg-card border border-border rounded-xl overflow-hidden shadow-soft">`.
   That class string occurs exactly once. The new card below carries the bottom margin instead.
3. Replace the end of the page body:
   ```tsx
             )}
           </div>
         </main>
   ```
   with:
   ```tsx
             )}
           </div>

           <MyFeedback />
         </main>
   ```
   Only the main return has `)}` + `</div>` + `</main>` in a row. The loading-state `<main>` does not.

- [ ] **Step 4: Add the header dot and the menu links**

In `fe/src/components/Header.tsx`:

1. Update the imports:
   - Change `import { Search, PenSquare, User, Menu, LogOut, X, LayoutDashboard, Code2 } from "lucide-react";` to `import { Search, PenSquare, User, Menu, LogOut, X, LayoutDashboard, Code2, MessageSquarePlus } from "lucide-react";`
   - Change `import { Link, useNavigate } from "react-router-dom";` to `import { Link, useLocation, useNavigate } from "react-router-dom";`
   - Add `import { useFeedbackUnread } from "@/hooks/useFeedbackUnread";` after the `useAuth` import.
2. After `const { user, signOut, loading } = useAuth();`, add:
   ```tsx
     const location = useLocation();
     const unreadReplies = useFeedbackUnread();
   ```
3. Replace the avatar trigger button:
   ```tsx
                     <Button variant="ghost" size="icon" className="hidden sm:flex rounded-full h-9 w-9 p-0">
                       <UserAvatar name={user.username || user.email} src={user.avatar_url} size="xs" />
                     </Button>
   ```
   with:
   ```tsx
                     <Button variant="ghost" size="icon" className="relative hidden sm:flex rounded-full h-9 w-9 p-0">
                       <UserAvatar name={user.username || user.email} src={user.avatar_url} size="xs" />
                       {unreadReplies > 0 && (
                         <>
                           <span
                             className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background"
                             aria-hidden="true"
                           />
                           <span className="sr-only">{t("feedback.unreadLabel")}</span>
                         </>
                       )}
                     </Button>
   ```
4. Replace the dropdown's "My profile" item:
   ```tsx
                     <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
                       <Link to="/profile" className="flex items-center">
                         <User className="h-4 w-4 mr-2" />
                         {t("common.myProfile")}
                       </Link>
                     </DropdownMenuItem>
   ```
   with:
   ```tsx
                     <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
                       <Link to="/profile" className="flex items-center">
                         <User className="h-4 w-4 mr-2" />
                         {t("common.myProfile")}
                         {unreadReplies > 0 && <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
                       </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
                       <Link to="/feedback" state={{ from: location.pathname }} className="flex items-center">
                         <MessageSquarePlus className="h-4 w-4 mr-2" />
                         {t("feedback.navLink")}
                       </Link>
                     </DropdownMenuItem>
   ```
5. In the mobile menu, replace:
   ```tsx
               {user && (
                 <Link
                   to="/profile"
                   onClick={() => setIsMenuOpen(false)}
                   className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
                 >
                   {t("common.myProfile")}
                 </Link>
               )}
   ```
   with:
   ```tsx
               {user && (
                 <>
                   <Link
                     to="/profile"
                     onClick={() => setIsMenuOpen(false)}
                     className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
                   >
                     {t("common.myProfile")}
                     {unreadReplies > 0 && <span className="ml-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
                   </Link>
                   <Link
                     to="/feedback"
                     state={{ from: location.pathname }}
                     onClick={() => setIsMenuOpen(false)}
                     className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
                   >
                     {t("feedback.navLink")}
                   </Link>
                 </>
               )}
   ```

- [ ] **Step 5: Add the footer link**

In `fe/src/components/Footer.tsx`:

1. Change `import { Link } from "react-router-dom";` to `import { Link, useLocation } from "react-router-dom";`.
2. Add a line to `ACCOUNT_LINKS`, after the `footer.myProfile` entry:
   ```ts
     { labelKey: "feedback.navLink", to: "/feedback" },
   ```
3. At the top of the component body, after `const { t } = useTranslation();`, add:
   ```tsx
     const { pathname } = useLocation();
   ```
4. In the `ACCOUNT_LINKS.map` render, add a `state` prop to the `<Link>`, so it reads:
   ```tsx
                     <Link
                       to={link.to}
                       state={link.to === "/feedback" ? { from: pathname } : undefined}
                       className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                     >
   ```
   Only edit the `<Link>` inside `ACCOUNT_LINKS.map`. The identical-looking one in `EXPLORE_LINKS.map` stays as it is.

- [ ] **Step 6: Type-check**

```bash
cd fe && npx tsc --noEmit -p tsconfig.app.json; cd ..
```
Expected: no output, and exit code 0.

- [ ] **Step 7: Commit**

```bash
git add fe/src/hooks/useFeedbackUnread.ts fe/src/components/MyFeedback.tsx fe/src/pages/Profile.tsx \
  fe/src/components/Header.tsx fe/src/components/Footer.tsx
git commit -m "feat(fe): my-feedback card with admin replies, unread dot and entry links

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: CMS — feedback inbox

**Files:**
- Modify: `cms/src/lib/api.ts` (`AdminStats.new_feedback`, `FeedbackStatus`, `AdminFeedback`)
- Create: `cms/src/pages/Feedback.tsx`
- Modify: `cms/src/components/Sidebar.tsx`, `cms/src/components/Layout.tsx`, `cms/src/App.tsx`

**Interfaces:**
- Consumes: `GET /admin/feedback`, `PATCH /admin/feedback/{id}`, and `GET /admin/stats` → `new_feedback`, all from Task 5. Also the CMS's existing `apiFetch`, `SITE_URL`, and `Layout`.
- Produces: the `/feedback` CMS route and a sidebar badge

- [ ] **Step 1: Add the types**

In `cms/src/lib/api.ts`, add a field to `AdminStats`, after `pending_embeds: number;`:

```ts
  new_feedback: number;
```

Then add these after the `AdminComment` interface:

```ts
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "spam";

export interface AdminFeedback {
  id: number;
  type: "bug" | "idea" | "complaint" | "praise" | "other";
  message: string;
  status: FeedbackStatus;
  /** "" when there is no reply. */
  admin_reply: string;
  replied_at: string | null;
  /** True until the user opens their profile after the latest reply. */
  reply_unread: boolean;
  page_path: string;
  user_agent: string;
  user: { id: number; username: string; email: string };
  created_at: string;
}
```

- [ ] **Step 2: Write the inbox page**

Create `cms/src/pages/Feedback.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, SITE_URL, type AdminFeedback, type FeedbackStatus } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Reply } from "lucide-react";
import { toast } from "sonner";

const STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "spam", label: "Spam" },
];

const TYPES: { value: AdminFeedback["type"]; label: string; className: string }[] = [
  { value: "bug", label: "Bug", className: "text-red-700 border-red-200 bg-red-50" },
  { value: "idea", label: "Idea", className: "text-sky-700 border-sky-200 bg-sky-50" },
  { value: "complaint", label: "Complaint", className: "text-amber-700 border-amber-200 bg-amber-50" },
  { value: "praise", label: "Praise", className: "text-emerald-700 border-emerald-200 bg-emerald-50" },
  { value: "other", label: "Other", className: "text-muted-foreground border-border bg-muted/40" },
];

const REPLY_MAX = 2000;
const typeInfo = (t: string) => TYPES.find((x) => x.value === t) ?? TYPES[4];
/** Characters as the server counts them (code points), after trimming. */
const chars = (s: string) => [...s.trim()].length;

type UpdateBody = { status?: FeedbackStatus; admin_reply?: string };

export default function Feedback() {
  const [status, setStatus] = useState<string>("new");
  const [type, setType] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const limit = 50;
  const qc = useQueryClient();

  const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);

  const { data, isLoading } = useQuery<{ data: AdminFeedback[]; total: number }>({
    queryKey: ["admin-feedback", status, type, page],
    queryFn: () => apiFetch(`/admin/feedback?${params}`),
  });
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const open = items.find((f) => f.id === openId) ?? null;

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateBody }) =>
      apiFetch(`/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      if (vars.body.admin_reply !== undefined) {
        toast.success(vars.body.admin_reply.trim() ? "Reply saved" : "Reply removed");
        setOpenId(null);
      } else {
        toast.success("Status updated");
      }
    },
    onError: (err: Error) => toast.error(err.message || "Update failed"),
  });

  const changeFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(0);
  };

  const openItem = (f: AdminFeedback) => {
    setOpenId(f.id);
    setReply(f.admin_reply);
  };

  const replyChars = chars(reply);
  const replyUnchanged = open !== null && reply.trim() === open.admin_reply;

  return (
    <Layout title="Feedback">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground mr-auto">{isLoading ? "Loading…" : `${total} matching`}</p>
          <Select value={status} onValueChange={changeFilter(setStatus)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={changeFilter(setType)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Message</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Page</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No feedback matches these filters.</td>
                </tr>
              ) : (
                items.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20 transition-colors align-top">
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs max-w-[180px]">
                      <p className="font-medium text-foreground truncate">{f.user.username || "—"}</p>
                      <p className="text-muted-foreground truncate">{f.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-xs ${typeInfo(f.type).className}`}>{typeInfo(f.type).label}</Badge>
                    </td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <button onClick={() => openItem(f)} className="text-left text-foreground hover:text-primary transition-colors" title="Open">
                        <p className="line-clamp-2 break-words">{f.message}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{f.page_path || "—"}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={f.status}
                        onValueChange={(v) => updateMut.mutate({ id: f.id, body: { status: v as FeedbackStatus } })}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openItem(f)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Reply className="h-3.5 w-3.5" />
                        {f.admin_reply ? (f.reply_unread ? "Sent · unseen" : "Sent · seen") : "Reply"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page + 1} of {Math.ceil(total / limit)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${typeInfo(open.type).className}`}>{typeInfo(open.type).label}</Badge>
                  Feedback #{open.id}
                </DialogTitle>
                <DialogDescription>
                  {open.user.username || "—"} · {open.user.email} · {new Date(open.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              {/* Plain text only: React escapes it, and pre-wrap keeps the user's line breaks. */}
              <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-words">
                {open.message}
              </div>

              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Page</dt>
                <dd className="break-all">
                  {open.page_path ? (
                    // The server only keeps paths starting with a single "/", so this always stays on our site.
                    <a href={`${SITE_URL}${open.page_path}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {open.page_path}
                    </a>
                  ) : "—"}
                </dd>
                <dt className="text-muted-foreground">Browser</dt>
                <dd className="break-all text-muted-foreground">{open.user_agent || "—"}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{STATUSES.find((s) => s.value === open.status)?.label}</dd>
              </dl>

              <div className="space-y-2">
                <label htmlFor="feedback-reply" className="text-sm font-medium">Reply to the user</label>
                <Textarea
                  id="feedback-reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="The user sees this on their profile. Leave empty to remove the reply."
                  className="min-h-[120px]"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {open.replied_at
                      ? `Replied ${new Date(open.replied_at).toLocaleString()} · ${open.reply_unread ? "not seen yet" : "seen"}`
                      : "No reply yet"}
                  </span>
                  <span className={replyChars > REPLY_MAX ? "text-destructive" : ""}>{replyChars} / {REPLY_MAX}</span>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenId(null)}>Close</Button>
                <Button
                  disabled={updateMut.isPending || replyChars > REPLY_MAX || replyUnchanged}
                  onClick={() => updateMut.mutate({ id: open.id, body: { admin_reply: reply } })}
                >
                  {reply.trim() === "" && open.admin_reply ? "Remove reply" : "Save reply"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
```

- [ ] **Step 3: Add the route, the nav item, and the badge**

In `cms/src/App.tsx`:
- Add `import Feedback from "@/pages/Feedback";` after `import Comments from "@/pages/Comments";`.
- Add this after the `/comments` route:
  ```tsx
      <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
  ```

In `cms/src/components/Sidebar.tsx`:
- Add `Inbox,` to the `lucide-react` import list, after `ListChecks,`.
- In `NAV`, add this after the Comments entry:
  ```ts
    { label: "Feedback", icon: Inbox, to: "/feedback", badge: "feedback" },
  ```
- In `interface Props`, add `newFeedback?: number;` after `pendingEmbeds?: number;`.
- Change the signature to `export function Sidebar({ open = false, onClose, pendingComments = 0, pendingOwners = 0, pendingEmbeds = 0, newFeedback = 0 }: Props) {`.
- After the `badge === "embeds"` block, add:
  ```tsx
                    {badge === "feedback" && newFeedback > 0 && (
                      <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {newFeedback}
                      </span>
                    )}
  ```

In `cms/src/components/Layout.tsx`, add a prop to `<Sidebar … />`, after `pendingEmbeds={stats?.pending_embeds}`:

```tsx
        newFeedback={stats?.new_feedback}
```

- [ ] **Step 4: Type-check**

```bash
cd cms && npx tsc --noEmit -p tsconfig.app.json; cd ..
```
Expected: no output, and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add cms/src/lib/api.ts cms/src/pages/Feedback.tsx cms/src/components/Sidebar.tsx cms/src/components/Layout.tsx cms/src/App.tsx
git commit -m "feat(cms): feedback inbox with status triage, replies and a new-items badge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification, manual run-through, and rollout notes

**Files:** none are created. This task verifies, then asks the user before touching shared state.

- [ ] **Step 1: Run the whole backend suite against both throwaway stores**

```bash
docker run --rm -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app golang:1.22 sh -c 'test -z "$(gofmt -l .)" && go vet ./... && go build ./...'
docker run --rm --network container:fb-redis-test -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app \
  -e REDIS_TEST_ADDR=127.0.0.1:6379 golang:1.22 go test ./... -count=1
docker run --rm --network container:fb-mysql-test -v $PWD/be:/app -v feedback-go-mod:/go/pkg/mod -w /app \
  -e MYSQL_TEST_DSN='root:test@tcp(127.0.0.1:3306)/feedback_test?parseTime=true&loc=UTC' golang:1.22 go test ./... -count=1
```
Expected: the first command exits 0 with no output, and every package reports `ok` in both test runs.

- [ ] **Step 2: Type-check and build both frontends**

```bash
(cd fe && npx tsc --noEmit -p tsconfig.app.json && npm run build) && (cd cms && npx tsc --noEmit -p tsconfig.app.json && npm run build)
```
Expected: `tsc` prints nothing and both builds succeed. `fe/dist` and `cms/dist` are already git-ignored, so there is nothing to clean up.

- [ ] **Step 3: Stop the throwaway containers**

```bash
docker stop fb-redis-test fb-mysql-test
```
Both were started with `--rm`, so stopping them also removes them.

- [ ] **Step 4: Ask before the manual run-through**

The manual pass needs the real app. That means merging `feat/user-feedback` into the **local** `main`, which is safe because nothing is pushed, so `be-api-1` hot-reloads it. It also means applying `016_feedback.sql` to the **shared** dev database `review-new`. Both are shared state on this host, so ask the user before doing either. Offer these commands:

```bash
git -C /home/rafiur/Desktop/projects/final-review merge --no-ff feat/user-feedback
# DB_USER / DB_PASSWORD are the values in be/.env. Read them there; don't paste them into any committed file.
docker exec -i common-mysql-1 sh -c 'mysql -u"$0" -p"$1" -D review-new' "$DB_USER" "$DB_PASSWORD" < be/migrations/016_feedback.sql
```

If the user declines, stop here and report that the automated checks passed and the manual pass is still open.

- [ ] **Step 5: Manual run-through (only after the user agrees)**

With the dev frontend (`cd fe && npm run dev`) and CMS running:

1. Sign in as a normal user. Open the header avatar menu → "Send feedback". Check that the page loads and that the chips and hint work.
2. Submit with no type, then with "hi". Check that the inline errors show under the right fields and that no request is sent (browser devtools, Network tab).
3. Pick Bug and send a real 30-character message. Check the thank-you state. "See your feedback" should scroll the profile to the "My feedback" card, which shows the item as **New**.
4. Go back and send a different message immediately. Check that the form shows "You can send more in 1 minute" (or seconds), with no toast.
5. After a minute, send the **same** text as step 3. Check that it says you already sent it. Then send a new message right away: it should be allowed, because the duplicate was refunded.
6. Switch to বাংলা and repeat step 4. The wait must use Bangla digits (৪২), and the counter too.
7. In the CMS, check that the sidebar shows a Feedback badge. Open the inbox (filter: New), open the item, and reply. The reply status should read "not seen yet".
8. As the user, reload any page. Check that a dot appears on the avatar. Open the profile: the reply shows with "New reply". Reload any page: the dot is gone. The CMS row now says "Sent · seen".
9. In the CMS, mark three of the user's items Spam. As the user, try to send again: "Feedback is paused on your account for now." On the profile, those items show **Closed**.
10. On a phone-width viewport (~400px), check the form, the profile card, and the mobile menu link.

- [ ] **Step 6: Report, and restate the rollout rule**

Report what passed. Tell the user explicitly: **apply `016_feedback.sql` on the VPS before pushing `main`**, because a push to `main` deploys to production. Without the table, every `/feedback` call answers 500, and the CMS badge silently shows 0.
