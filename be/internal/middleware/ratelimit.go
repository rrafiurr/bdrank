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

			// Refund unless the handler finishes with a status below 400. The
			// check runs in a defer so a handler that panics is refunded too;
			// the panic still propagates to Recoverer.
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			failed := true
			defer func() {
				if !failed {
					return
				}
				ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Second)
				defer cancel()
				if err := l.Refund(ctx, scope, subject, rules, token); err != nil {
					log.Printf("WARN ratelimit refund scope=%s user=%d: %v", scope, userID, err)
				}
			}()
			next.ServeHTTP(ww, r)
			failed = ww.Status() >= 400
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
