package handlers

import (
	"database/sql"
	"net/http"
)

type SearchHandler struct {
	db *sql.DB
}

func NewSearchHandler(db *sql.DB) *SearchHandler {
	return &SearchHandler{db: db}
}

func (h *SearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		writeJSON(w, http.StatusOK, map[string]any{
			"reviews":  []any{},
			"products": []any{},
		})
		return
	}
	limit := queryInt(r, "limit", 5)
	like := "%" + q + "%"

	type reviewResult struct {
		ID       int64  `json:"id"`
		Title    string `json:"title"`
		Category string `json:"category"`
	}
	type productResult struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Category string `json:"category"`
	}

	reviews := []reviewResult{}
	rRows, err := h.db.QueryContext(r.Context(), `
		SELECT r.id, r.title, p.category
		FROM reviews r
		INNER JOIN products p ON r.product_id = p.id
		WHERE r.title LIKE ? OR p.name LIKE ?
		LIMIT ?`, like, like, limit)
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			var rv reviewResult
			rRows.Scan(&rv.ID, &rv.Title, &rv.Category)
			reviews = append(reviews, rv)
		}
	}

	products := []productResult{}
	pRows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, category FROM products WHERE name LIKE ? LIMIT ?`, like, limit)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var p productResult
			pRows.Scan(&p.ID, &p.Name, &p.Category)
			products = append(products, p)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"reviews":  reviews,
		"products": products,
	})
}
