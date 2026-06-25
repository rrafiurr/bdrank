package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
)

type ProfileHandler struct {
	users *repository.UserRepo
	db    *sql.DB
}

func NewProfileHandler(users *repository.UserRepo, db *sql.DB) *ProfileHandler {
	return &ProfileHandler{users: users, db: db}
}

func (h *ProfileHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	user, err := h.users.FindByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *ProfileHandler) MyReviews(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT r.id, r.title, r.rating, r.is_approved, p.name AS product, r.created_at
		FROM reviews r
		INNER JOIN products p ON p.id = r.product_id
		WHERE r.user_id = ?
		ORDER BY r.created_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch reviews")
		return
	}
	defer rows.Close()

	type row struct {
		ID         int64     `json:"id"`
		Title      string    `json:"title"`
		Rating     int       `json:"rating"`
		IsApproved bool      `json:"is_approved"`
		Product    string    `json:"product"`
		CreatedAt  time.Time `json:"created_at"`
	}
	var list []row
	for rows.Next() {
		var rv row
		var approved int
		rows.Scan(&rv.ID, &rv.Title, &rv.Rating, &approved, &rv.Product, &rv.CreatedAt)
		rv.IsApproved = approved == 1
		list = append(list, rv)
	}
	if list == nil {
		list = []row{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *ProfileHandler) MyComments(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT c.id, LEFT(c.content, 120) AS content, c.is_approved,
		       r.id AS review_id, r.title AS review_title,
		       p.name AS product, c.created_at
		FROM comments c
		INNER JOIN reviews r ON r.id = c.review_id
		INNER JOIN products p ON p.id = r.product_id
		WHERE c.user_id = ?
		ORDER BY c.created_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch comments")
		return
	}
	defer rows.Close()

	type row struct {
		ID           int64     `json:"id"`
		Content      string    `json:"content"`
		IsApproved   bool      `json:"is_approved"`
		ReviewID     int64     `json:"review_id"`
		ReviewTitle  string    `json:"review_title"`
		Product      string    `json:"product"`
		CreatedAt    time.Time `json:"created_at"`
	}
	var list []row
	for rows.Next() {
		var cm row
		var approved int
		rows.Scan(&cm.ID, &cm.Content, &approved, &cm.ReviewID, &cm.ReviewTitle, &cm.Product, &cm.CreatedAt)
		cm.IsApproved = approved == 1
		list = append(list, cm)
	}
	if list == nil {
		list = []row{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *ProfileHandler) MyProducts(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, name, category FROM products WHERE owner_id = ? ORDER BY name ASC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch products")
		return
	}
	defer rows.Close()

	type product struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Category string `json:"category"`
	}
	var list []product
	for rows.Next() {
		var p product
		rows.Scan(&p.ID, &p.Name, &p.Category)
		list = append(list, p)
	}
	if list == nil {
		list = []product{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *ProfileHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())

	var body struct {
		Username  *string `json:"username"`
		Bio       *string `json:"bio"`
		AvatarURL *string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.users.UpdateProfile(r.Context(), userID, body.Username, body.Bio, body.AvatarURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}
	writeJSON(w, http.StatusOK, user)
}
