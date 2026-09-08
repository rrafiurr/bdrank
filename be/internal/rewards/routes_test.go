package rewards

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

// passthrough stands in for OptionalAuth: it sets no user and always continues.
func passthrough(next http.Handler) http.Handler { return next }

// blocking stands in for Auth: it rejects every request, so a route mounted
// under it can be told apart from one mounted under optional auth.
func blocking(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
}

func TestLeaderboardIsReachableWithoutAuth(t *testing.T) {
	r := chi.NewRouter()
	RegisterRoutes(r, nil, blocking, passthrough, blocking)

	req := httptest.NewRequest(http.MethodGet, "/rewards/leaderboard?timeframe=week&limit=5&offset=0", nil)
	rec := httptest.NewRecorder()

	// The handler will fail on a nil service; all this test asserts is that
	// the request was not turned away by the auth middleware first.
	defer func() { recover() }()
	r.ServeHTTP(rec, req)

	if rec.Code == http.StatusUnauthorized {
		t.Fatalf("anonymous leaderboard request got 401; it must be mounted under optional auth")
	}
}

func TestRewardsMeStillRequiresAuth(t *testing.T) {
	r := chi.NewRouter()
	RegisterRoutes(r, nil, blocking, passthrough, blocking)

	req := httptest.NewRequest(http.MethodGet, "/rewards/me", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("/rewards/me code = %d, want 401 — it must stay behind auth", rec.Code)
	}
}
