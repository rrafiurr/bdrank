package router

import (
	"database/sql"
	"net/http"

	"final-review/be/internal/config"
	"final-review/be/internal/handlers"
	mw "final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/redis/go-redis/v9"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func New(cfg *config.Config, db *sql.DB, rdb *redis.Client) http.Handler {
	// repositories
	userRepo    := repository.NewUserRepo(db, cfg.BaseURL)
	productRepo := repository.NewProductRepo(db, cfg.BaseURL)
	reviewRepo  := repository.NewReviewRepo(db, cfg.BaseURL)
	commentRepo := repository.NewCommentRepo(db, cfg.BaseURL)
	pageRepo    := repository.NewPageRepo(db)

	// handlers
	authH     := handlers.NewAuthHandler(userRepo, rdb, cfg)
	profileH  := handlers.NewProfileHandler(userRepo)
	uploadH   := handlers.NewUploadHandler(cfg)
	productH  := handlers.NewProductHandler(productRepo, reviewRepo)
	reviewH   := handlers.NewReviewHandler(reviewRepo, productRepo, cfg)
	timelineH := handlers.NewTimelineHandler(reviewRepo, cfg)
	commentH  := handlers.NewCommentHandler(commentRepo, reviewRepo)
	searchH   := handlers.NewSearchHandler(db)
	pageH     := handlers.NewPageHandler(pageRepo)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// serve uploaded files
	r.Handle("/uploads/*", http.StripPrefix("/uploads/",
		http.FileServer(http.Dir(cfg.UploadDir))))

	r.Route("/api/v1", func(r chi.Router) {
		// public
		r.Post("/auth/register", authH.Register)
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

		// authenticated
		r.Group(func(r chi.Router) {
			r.Use(mw.Auth(cfg, rdb))

			r.Post("/auth/logout", authH.Logout)
			r.Get("/auth/me", authH.Me)

			r.Get("/profile", profileH.Get)
			r.Put("/profile", profileH.Update)

			r.Post("/upload/image", uploadH.Image)

			r.Post("/reviews", reviewH.Create)
			r.Post("/reviews/{id}/like", reviewH.Like)
			r.Post("/reviews/{id}/timeline", timelineH.Create)
			r.Post("/reviews/{id}/comments", commentH.Create)
			r.Post("/reviews/{id}/comments/{comment_id}/like", commentH.LikeComment)
		})
	})

	return r
}
