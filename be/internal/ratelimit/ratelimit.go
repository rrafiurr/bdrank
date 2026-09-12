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
