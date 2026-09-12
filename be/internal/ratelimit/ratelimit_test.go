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
