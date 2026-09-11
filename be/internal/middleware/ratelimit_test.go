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
