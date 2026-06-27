package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"final-review/be/internal/middleware"
	"final-review/be/internal/models"
	"final-review/be/internal/repository"
	"final-review/be/internal/storage"
	"github.com/go-chi/chi/v5"
)

type AdminHandler struct {
	db       *sql.DB
	users    *repository.UserRepo
	reviews  *repository.ReviewRepo
	products *repository.ProductRepo
	pages    *repository.PageRepo
	storage  storage.Storage
}

func NewAdminHandler(
	db *sql.DB,
	users *repository.UserRepo,
	reviews *repository.ReviewRepo,
	products *repository.ProductRepo,
	pages *repository.PageRepo,
	s storage.Storage,
) *AdminHandler {
	return &AdminHandler{db: db, users: users, reviews: reviews, products: products, pages: pages, storage: s}
}

// ── Dashboard ────────────────────────────────────────────────────────────────

func (h *AdminHandler) Stats(w http.ResponseWriter, r *http.Request) {
	var totalUsers, totalReviews, pendingReviews, totalComments, pendingComments, totalProducts, totalPages, totalCategories, pendingOwners int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&totalUsers)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM reviews`).Scan(&totalReviews)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM reviews WHERE is_approved = 0`).Scan(&pendingReviews)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM comments`).Scan(&totalComments)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM comments WHERE is_approved = 0`).Scan(&pendingComments)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM products`).Scan(&totalProducts)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM pages WHERE is_published = 1`).Scan(&totalPages)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM categories`).Scan(&totalCategories)
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE is_product_owner = 1 AND owner_verified = 0`).Scan(&pendingOwners)
	writeJSON(w, http.StatusOK, map[string]int{
		"total_users":      totalUsers,
		"total_reviews":    totalReviews,
		"pending_reviews":  pendingReviews,
		"total_comments":   totalComments,
		"pending_comments": pendingComments,
		"total_products":   totalProducts,
		"total_pages":      totalPages,
		"total_categories": totalCategories,
		"pending_owners":   pendingOwners,
	})
}

// ── Product Owners ────────────────────────────────────────────────────────────

func (h *AdminHandler) ListOwners(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT u.id, u.email, COALESCE(u.full_name,''), COALESCE(u.company_name,''),
		       u.owner_verified, u.created_at,
		       COALESCE(GROUP_CONCAT(p.id ORDER BY p.id SEPARATOR ','),'') AS product_ids,
		       COALESCE(GROUP_CONCAT(p.name ORDER BY p.id SEPARATOR '|'),'') AS product_names
		FROM users u
		LEFT JOIN products p ON p.owner_id = u.id
		WHERE u.is_product_owner = 1
		GROUP BY u.id, u.email, u.full_name, u.company_name, u.owner_verified, u.created_at
		ORDER BY u.owner_verified ASC, u.created_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch owners")
		return
	}
	defer rows.Close()

	type ownerRow struct {
		ID           int64     `json:"id"`
		Email        string    `json:"email"`
		FullName     string    `json:"full_name"`
		CompanyName  string    `json:"company_name"`
		Verified     bool      `json:"owner_verified"`
		CreatedAt    time.Time `json:"created_at"`
		ProductIDs   []int64   `json:"product_ids"`
		ProductNames []string  `json:"product_names"`
	}

	var list []ownerRow
	for rows.Next() {
		var o ownerRow
		var verified int
		var pidStr, pnameStr string
		rows.Scan(&o.ID, &o.Email, &o.FullName, &o.CompanyName, &verified, &o.CreatedAt, &pidStr, &pnameStr)
		o.Verified = verified == 1
		o.ProductIDs = parseIntList(pidStr)
		if pnameStr != "" {
			o.ProductNames = strings.Split(pnameStr, "|")
		} else {
			o.ProductNames = []string{}
		}
		list = append(list, o)
	}
	if list == nil {
		list = []ownerRow{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *AdminHandler) UpdateOwner(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Verified   *bool   `json:"owner_verified"`
		ProductIDs []int64 `json:"product_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if body.Verified != nil {
		v := 0
		if *body.Verified {
			v = 1
		}
		h.db.ExecContext(r.Context(), `UPDATE users SET owner_verified = ? WHERE id = ? AND is_product_owner = 1`, v, id)
	}

	if body.ProductIDs != nil {
		// Unassign all products currently owned by this user
		h.db.ExecContext(r.Context(), `UPDATE products SET owner_id = NULL WHERE owner_id = ?`, id)
		// Assign the specified products (respecting the one-owner-per-product rule)
		for _, pid := range body.ProductIDs {
			h.db.ExecContext(r.Context(), `UPDATE products SET owner_id = ? WHERE id = ?`, id, pid)
		}
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Users ────────────────────────────────────────────────────────────────────

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.users.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch users")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Prevent self-demotion
	callerID := middleware.UserIDFromCtx(r.Context())
	if id == callerID {
		writeError(w, http.StatusBadRequest, "cannot modify your own admin status")
		return
	}

	var body struct {
		IsAdmin *bool `json:"is_admin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if body.IsAdmin != nil {
		if err := h.users.SetAdmin(r.Context(), id, *body.IsAdmin); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update user")
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Reviews ──────────────────────────────────────────────────────────────────

func (h *AdminHandler) ListReviews(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT r.id, r.title, r.rating, r.is_approved, p.name, COALESCE(u.username, u.email), r.created_at
		FROM reviews r
		INNER JOIN products p ON r.product_id = p.id
		INNER JOIN users u ON r.user_id = u.id
		ORDER BY r.is_approved ASC, r.created_at DESC
		LIMIT ? OFFSET ?`, limit, offset)
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
		Author     string    `json:"author"`
		CreatedAt  time.Time `json:"created_at"`
	}
	var list []row
	for rows.Next() {
		var rv row
		var approved int
		rows.Scan(&rv.ID, &rv.Title, &rv.Rating, &approved, &rv.Product, &rv.Author, &rv.CreatedAt)
		rv.IsApproved = approved == 1
		list = append(list, rv)
	}
	if list == nil {
		list = []row{}
	}

	var total int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM reviews`).Scan(&total)
	writeJSON(w, http.StatusOK, map[string]any{"data": list, "total": total})
}

func (h *AdminHandler) UpdateReview(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		IsApproved *bool `json:"is_approved"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	if body.IsApproved != nil {
		v := 0
		if *body.IsApproved {
			v = 1
		}
		h.db.ExecContext(r.Context(), `UPDATE reviews SET is_approved = ? WHERE id = ?`, v, id)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AdminHandler) DeleteReview(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	// Collect stored image paths before the DB cascade removes their rows:
	// review images and timeline-entry images both live in the uploads folder.
	paths := h.reviewImagePaths(r.Context(), id)

	if _, err := h.db.ExecContext(r.Context(), `DELETE FROM reviews WHERE id = ?`, id); err != nil {
		log.Printf("ERROR DeleteReview id=%d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "failed to delete review")
		return
	}

	// Best-effort: remove files from disk. The DB is already consistent, so a
	// file-deletion failure is logged but does not fail the request.
	for _, p := range paths {
		if err := h.storage.Delete(r.Context(), p); err != nil {
			log.Printf("WARN DeleteReview id=%d failed to remove image %q: %v", id, p, err)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// reviewImagePaths returns the stored paths of all images belonging to a review
// (its review_images plus any timeline-entry image_url).
func (h *AdminHandler) reviewImagePaths(ctx context.Context, reviewID int64) []string {
	var paths []string

	if rows, err := h.db.QueryContext(ctx,
		`SELECT url FROM review_images WHERE review_id = ?`, reviewID); err == nil {
		for rows.Next() {
			var p string
			if rows.Scan(&p) == nil && p != "" {
				paths = append(paths, p)
			}
		}
		rows.Close()
	}

	if rows, err := h.db.QueryContext(ctx,
		`SELECT image_url FROM timeline_entries WHERE review_id = ? AND image_url IS NOT NULL AND image_url != ''`,
		reviewID); err == nil {
		for rows.Next() {
			var p string
			if rows.Scan(&p) == nil && p != "" {
				paths = append(paths, p)
			}
		}
		rows.Close()
	}

	return paths
}

// ── Comments ─────────────────────────────────────────────────────────────────

func (h *AdminHandler) ListComments(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT c.id, LEFT(c.content, 120), c.is_approved, r.id, r.title,
		       COALESCE(u.username, u.email), c.created_at
		FROM comments c
		INNER JOIN reviews r ON c.review_id = r.id
		INNER JOIN users u ON c.user_id = u.id
		ORDER BY c.created_at DESC
		LIMIT ? OFFSET ?`, limit, offset)
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
		Author       string    `json:"author"`
		CreatedAt    time.Time `json:"created_at"`
	}
	var list []row
	for rows.Next() {
		var cm row
		var approved int
		rows.Scan(&cm.ID, &cm.Content, &approved, &cm.ReviewID, &cm.ReviewTitle, &cm.Author, &cm.CreatedAt)
		cm.IsApproved = approved == 1
		list = append(list, cm)
	}
	if list == nil {
		list = []row{}
	}

	var total int
	h.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM comments`).Scan(&total)
	writeJSON(w, http.StatusOK, map[string]any{"data": list, "total": total})
}

func (h *AdminHandler) UpdateComment(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		IsApproved *bool `json:"is_approved"`
	}
	json.NewDecoder(r.Body).Decode(&body)
	if body.IsApproved != nil {
		v := 0
		if *body.IsApproved {
			v = 1
		}
		h.db.ExecContext(r.Context(), `UPDATE comments SET is_approved = ? WHERE id = ?`, v, id)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AdminHandler) DeleteComment(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	h.db.ExecContext(r.Context(), `DELETE FROM comments WHERE id = ?`, id)
	w.WriteHeader(http.StatusNoContent)
}

// ── Categories ───────────────────────────────────────────────────────────────

func (h *AdminHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Slug  string `json:"slug"`
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Slug == "" || body.Label == "" {
		writeError(w, http.StatusBadRequest, "slug and label are required")
		return
	}
	body.Slug = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(body.Slug), " ", "-"))
	_, err := h.db.ExecContext(r.Context(), `INSERT INTO categories (slug, label) VALUES (?, ?)`, body.Slug, body.Label)
	if err != nil {
		writeError(w, http.StatusConflict, "slug already exists")
		return
	}
	writeJSON(w, http.StatusCreated, models.Category{Slug: body.Slug, Label: body.Label})
}

func (h *AdminHandler) UpdateCategory(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var body struct {
		Label string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Label == "" {
		writeError(w, http.StatusBadRequest, "label is required")
		return
	}
	h.db.ExecContext(r.Context(), `UPDATE categories SET label = ? WHERE slug = ?`, body.Label, slug)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AdminHandler) DeleteCategory(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	h.db.ExecContext(r.Context(), `DELETE FROM categories WHERE slug = ?`, slug)
	w.WriteHeader(http.StatusNoContent)
}

// ── Pages ────────────────────────────────────────────────────────────────────

func (h *AdminHandler) ListAllPages(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(),
		`SELECT slug, title, COALESCE(meta_description,''), is_published, updated_at FROM pages ORDER BY slug`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch pages")
		return
	}
	defer rows.Close()

	type row struct {
		Slug            string    `json:"slug"`
		Title           string    `json:"title"`
		MetaDescription string    `json:"meta_description"`
		IsPublished     bool      `json:"is_published"`
		UpdatedAt       time.Time `json:"updated_at"`
	}
	var list []row
	for rows.Next() {
		var p row
		var pub int
		rows.Scan(&p.Slug, &p.Title, &p.MetaDescription, &pub, &p.UpdatedAt)
		p.IsPublished = pub == 1
		list = append(list, p)
	}
	if list == nil {
		list = []row{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *AdminHandler) CreatePage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Slug            string `json:"slug"`
		Title           string `json:"title"`
		MetaDescription string `json:"meta_description"`
		Content         string `json:"content"`
		IsPublished     bool   `json:"is_published"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Slug == "" || body.Title == "" {
		writeError(w, http.StatusBadRequest, "slug and title are required")
		return
	}
	pub := 0
	if body.IsPublished {
		pub = 1
	}
	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO pages (slug, title, meta_description, content, is_published) VALUES (?, ?, ?, ?, ?)`,
		body.Slug, body.Title, body.MetaDescription, body.Content, pub)
	if err != nil {
		writeError(w, http.StatusConflict, "slug already exists")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"ok": true})
}

func (h *AdminHandler) UpdatePage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	var body struct {
		Title           *string `json:"title"`
		MetaDescription *string `json:"meta_description"`
		Content         *string `json:"content"`
		IsPublished     *bool   `json:"is_published"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	h.db.ExecContext(r.Context(), `
		UPDATE pages SET
		  title            = COALESCE(?, title),
		  meta_description = COALESCE(?, meta_description),
		  content          = COALESCE(?, content),
		  is_published     = CASE WHEN ? IS NOT NULL THEN ? ELSE is_published END
		WHERE slug = ?`,
		body.Title, body.MetaDescription, body.Content,
		body.IsPublished, func() interface{} {
			if body.IsPublished == nil {
				return nil
			}
			if *body.IsPublished {
				return 1
			}
			return 0
		}(),
		slug)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AdminHandler) DeletePage(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	h.db.ExecContext(r.Context(), `DELETE FROM pages WHERE slug = ?`, slug)
	w.WriteHeader(http.StatusNoContent)
}

// ── Products ─────────────────────────────────────────────────────────────────

func (h *AdminHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Category string `json:"category"`
		ImageURL string `json:"image_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" || body.Category == "" {
		writeError(w, http.StatusBadRequest, "name and category are required")
		return
	}
	res, err := h.db.ExecContext(r.Context(),
		`INSERT INTO products (name, category, image_url) VALUES (?, ?, NULLIF(?, ''))`,
		body.Name, body.Category, body.ImageURL)
	if err != nil {
		writeError(w, http.StatusConflict, "product already exists")
		return
	}
	id, _ := res.LastInsertId()
	p, _ := h.products.FindByID(r.Context(), id)
	writeJSON(w, http.StatusCreated, p)
}

func (h *AdminHandler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var body struct {
		Name     *string `json:"name"`
		Category *string `json:"category"`
		ImageURL *string `json:"image_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	h.db.ExecContext(r.Context(), `
		UPDATE products SET
		  name      = COALESCE(?, name),
		  category  = COALESCE(?, category),
		  image_url = COALESCE(?, image_url)
		WHERE id = ?`, body.Name, body.Category, body.ImageURL, id)
	p, _ := h.products.FindByID(r.Context(), id)
	writeJSON(w, http.StatusOK, p)
}

func (h *AdminHandler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	h.db.ExecContext(r.Context(), `DELETE FROM products WHERE id = ?`, id)
	w.WriteHeader(http.StatusNoContent)
}

func parseIntList(s string) []int64 {
	if s == "" {
		return []int64{}
	}
	parts := strings.Split(s, ",")
	out := make([]int64, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		n, err := strconv.ParseInt(p, 10, 64)
		if err == nil {
			out = append(out, n)
		}
	}
	return out
}
