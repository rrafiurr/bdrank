package router

import (
	"database/sql"
	"net/http"
	"strings"

	"final-review/be/internal/config"
	"final-review/be/internal/handlers"
	mw "final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"final-review/be/internal/storage"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/redis/go-redis/v9"
)

// buildCORSMiddleware returns a handler that allows only the configured origins.
// When allowedOrigins is "*" every origin is permitted (suitable for local dev).
func buildCORSMiddleware(allowedOrigins string) func(http.Handler) http.Handler {
	origins := map[string]bool{}
	wildcard := false
	for _, o := range strings.Split(allowedOrigins, ",") {
		o = strings.TrimSpace(o)
		if o == "*" {
			wildcard = true
		} else if o != "" {
			origins[o] = true
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if wildcard {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			} else if origins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func New(cfg *config.Config, db *sql.DB, rdb *redis.Client) http.Handler {
	// repositories
	userRepo    := repository.NewUserRepo(db, cfg.BaseURL)
	productRepo := repository.NewProductRepo(db, cfg.BaseURL)
	reviewRepo  := repository.NewReviewRepo(db, cfg.BaseURL)
	commentRepo := repository.NewCommentRepo(db, cfg.BaseURL)
	pageRepo    := repository.NewPageRepo(db)

	// storage — swap NewLocal for a CDN implementation to change hosting
	store := storage.NewLocal(cfg.UploadDir, cfg.BaseURL)

	// handlers
	authH     := handlers.NewAuthHandler(userRepo, rdb, cfg)
	profileH  := handlers.NewProfileHandler(userRepo, db)
	uploadH   := handlers.NewUploadHandler(store)
	productH  := handlers.NewProductHandler(productRepo, reviewRepo)
	reviewH   := handlers.NewReviewHandler(reviewRepo, productRepo, store)
	timelineH := handlers.NewTimelineHandler(reviewRepo, store)
	commentH  := handlers.NewCommentHandler(commentRepo, reviewRepo, userRepo)
	searchH   := handlers.NewSearchHandler(db)
	pageH     := handlers.NewPageHandler(pageRepo)
	adminH    := handlers.NewAdminHandler(db, userRepo, reviewRepo, productRepo, pageRepo, store)
	sitemapH  := handlers.NewSitemapHandler(db, cfg.SiteURL)
	externalH := handlers.NewExternalHandler(db, cfg.ExternalUser, cfg.ExternalPass)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(buildCORSMiddleware(cfg.AllowedOrigins))

	// serve uploaded files
	r.Handle("/uploads/*", http.StripPrefix("/uploads/",
		http.FileServer(http.Dir(cfg.UploadDir))))

	// sitemap (served at root, not under /api/v1)
	r.Get("/sitemap.xml", sitemapH.Sitemap)

	// external API — Basic Auth, no JWT
	r.Route("/api/v1/external", func(r chi.Router) {
		r.Post("/reviews", externalH.CreateReview)
		r.Get("/sources", externalH.ListSources)
	})

	r.Route("/api/v1", func(r chi.Router) {
		// public
		r.Post("/auth/register", authH.Register)
		r.Post("/auth/register/owner", authH.RegisterOwner)
		r.Post("/auth/login", authH.Login)

		r.Get("/products", productH.List)
		r.Get("/products/{id}", productH.GetByID)
		r.Get("/products/{id}/reviews", productH.ListReviews)
		r.Get("/categories", productH.ListCategories)
		r.Get("/categories/stats", productH.CategoryStats)

		r.Get("/reviews", reviewH.List)
		r.Get("/reviews/{id}", reviewH.GetByID)
		r.Post("/reviews/{id}/view", reviewH.View)

		r.Get("/pages", pageH.List)
		r.Get("/pages/{slug}", pageH.Get)

		r.Get("/search", searchH.Search)

		r.Get("/stats", func(w http.ResponseWriter, r *http.Request) {
			var reviews, timelines, members int
			db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM reviews WHERE is_approved = 1`).Scan(&reviews)
			db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM reviews WHERE is_approved = 1 AND is_timeline = 1`).Scan(&timelines)
			db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE email != 'import-bot@system.internal'`).Scan(&members)
			handlers.WritePublicJSON(w, map[string]int{
				"reviews":   reviews,
				"timelines": timelines,
				"members":   members,
			})
		})

		// authenticated
		r.Group(func(r chi.Router) {
			r.Use(mw.Auth(cfg, rdb))

			r.Post("/auth/logout", authH.Logout)
			r.Get("/auth/me", authH.Me)

			r.Get("/profile", profileH.Get)
			r.Put("/profile", profileH.Update)
			r.Get("/profile/reviews", profileH.MyReviews)
			r.Get("/profile/comments", profileH.MyComments)

			r.Post("/upload/image", uploadH.Image)

			r.Post("/reviews", reviewH.Create)
			r.Post("/reviews/{id}/like", reviewH.Like)
			r.Post("/reviews/{id}/timeline", timelineH.Create)
			r.Post("/reviews/{id}/comments", commentH.Create)
			r.Post("/reviews/{id}/comments/{comment_id}/like", commentH.LikeComment)
		})

		// admin-only
		r.Group(func(r chi.Router) {
			r.Use(mw.Admin(cfg, rdb, userRepo))

			r.Get("/admin/stats", adminH.Stats)

			r.Get("/admin/users", adminH.ListUsers)
			r.Patch("/admin/users/{id}", adminH.UpdateUser)

			r.Get("/admin/owners", adminH.ListOwners)
			r.Patch("/admin/owners/{id}", adminH.UpdateOwner)

			r.Get("/admin/reviews", adminH.ListReviews)
			r.Patch("/admin/reviews/{id}", adminH.UpdateReview)
			r.Delete("/admin/reviews/{id}", adminH.DeleteReview)

			r.Get("/admin/comments", adminH.ListComments)
			r.Patch("/admin/comments/{id}", adminH.UpdateComment)
			r.Delete("/admin/comments/{id}", adminH.DeleteComment)

			r.Post("/admin/categories", adminH.CreateCategory)
			r.Patch("/admin/categories/{slug}", adminH.UpdateCategory)
			r.Delete("/admin/categories/{slug}", adminH.DeleteCategory)

			r.Get("/admin/pages", adminH.ListAllPages)
			r.Post("/admin/pages", adminH.CreatePage)
			r.Patch("/admin/pages/{slug}", adminH.UpdatePage)
			r.Delete("/admin/pages/{slug}", adminH.DeletePage)

			r.Post("/admin/products", adminH.CreateProduct)
			r.Patch("/admin/products/{id}", adminH.UpdateProduct)
			r.Delete("/admin/products/{id}", adminH.DeleteProduct)
		})
	})

	return r
}
