package middleware

import (
	"context"
	"net/http"
	"strings"

	"final-review/be/internal/auth"
	"final-review/be/internal/config"
	"final-review/be/internal/repository"
	"github.com/redis/go-redis/v9"
)

// Admin validates a Bearer JWT and additionally requires is_admin = 1 on the user row.
func Admin(cfg *config.Config, rdb *redis.Client, users *repository.UserRepo) func(http.Handler) http.Handler {
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

			if !users.IsAdmin(r.Context(), claims.UserID) {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), ctxUserID, claims.UserID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
