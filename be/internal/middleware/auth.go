package middleware

import (
	"context"
	"net/http"
	"strings"

	"final-review/be/internal/auth"
	"final-review/be/internal/config"
	"github.com/redis/go-redis/v9"
)

type ctxKey int

const (
	ctxUserID ctxKey = iota
	ctxJTI
)

// Auth returns an HTTP middleware that validates Bearer JWT tokens.
func Auth(cfg *config.Config, rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			bearer := r.Header.Get("Authorization")
			if !strings.HasPrefix(bearer, "Bearer ") {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			tokenStr := strings.TrimPrefix(bearer, "Bearer ")

			claims, err := auth.ParseToken(tokenStr, cfg.JWTSecret)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			if !auth.ValidateSession(r.Context(), claims.JTI, rdb) {
				http.Error(w, `{"error":"session expired"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
			ctx = context.WithValue(ctx, ctxJTI, claims.JTI)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserIDFromCtx(ctx context.Context) int64 {
	if v, ok := ctx.Value(ctxUserID).(int64); ok {
		return v
	}
	return 0
}

func JTIFromCtx(ctx context.Context) string {
	if v, ok := ctx.Value(ctxJTI).(string); ok {
		return v
	}
	return ""
}
