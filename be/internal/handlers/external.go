package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
)

type ExternalHandler struct {
	db       *sql.DB
	username string
	password string
}

func NewExternalHandler(db *sql.DB, username, password string) *ExternalHandler {
	return &ExternalHandler{db: db, username: username, password: password}
}

func (h *ExternalHandler) checkAuth(r *http.Request) bool {
	if h.password == "" {
		return false
	}
	u, p, ok := r.BasicAuth()
	return ok && u == h.username && p == h.password
}

// botUserID returns the ID of the system import-bot user.
func (h *ExternalHandler) botUserID(r *http.Request) (int64, error) {
	var id int64
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id FROM users WHERE email = 'import-bot@system.internal' LIMIT 1`).Scan(&id)
	return id, err
}

type externalReviewRequest struct {
	ProductID    int64  `json:"product_id"`
	Title        string `json:"title"`
	Content      string `json:"content"`
	Rating       int    `json:"rating"`
	AuthorName   string `json:"author_name"`
	Source       string `json:"source"`
	SourceURL    string `json:"source_url"`
	ExternalID   string `json:"external_id"`
	ReviewedAt   string `json:"reviewed_at"` // ISO-8601, optional
}

type externalReviewResponse struct {
	ID         int64     `json:"id"`
	ProductID  int64     `json:"product_id"`
	Title      string    `json:"title"`
	Rating     int       `json:"rating"`
	Source     string    `json:"source"`
	AuthorName string    `json:"author_name"`
	ExternalID string    `json:"external_id"`
	CreatedAt  time.Time `json:"created_at"`
}

// CreateReview accepts an external review (e.g. from Google) and stores it
// as an auto-approved review attributed to the system import-bot user.
func (h *ExternalHandler) CreateReview(w http.ResponseWriter, r *http.Request) {
	if !h.checkAuth(r) {
		w.Header().Set("WWW-Authenticate", `Basic realm="ReviewHub External API"`)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	var req externalReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Validate required fields
	if req.ProductID == 0 {
		writeError(w, http.StatusBadRequest, "product_id is required")
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}
	if req.Source == "" {
		req.Source = "external"
	}

	// Check product exists
	var exists bool
	if err := h.db.QueryRowContext(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM products WHERE id = ?)`, req.ProductID).Scan(&exists); err != nil || !exists {
		writeError(w, http.StatusBadRequest, "product not found")
		return
	}

	// Skip duplicate (same source + external_id)
	if req.ExternalID != "" {
		var dup bool
		h.db.QueryRowContext(r.Context(),
			`SELECT EXISTS(SELECT 1 FROM reviews WHERE source = ? AND external_id = ?)`,
			req.Source, req.ExternalID).Scan(&dup)
		if dup {
			writeError(w, http.StatusConflict, "review already imported")
			return
		}
	}

	botID, err := h.botUserID(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "system user not found — run migration 004")
		return
	}

	// Use provided review date if given, otherwise now
	createdAt := time.Now()
	if req.ReviewedAt != "" {
		if t, err := time.Parse(time.RFC3339, req.ReviewedAt); err == nil {
			createdAt = t
		} else if t, err := time.Parse("2006-01-02", req.ReviewedAt); err == nil {
			createdAt = t
		}
	}

	result, err := h.db.ExecContext(r.Context(), `
		INSERT INTO reviews
		  (user_id, product_id, title, content, rating, is_approved, source, source_author, source_url, external_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
		botID, req.ProductID, req.Title, req.Content, req.Rating,
		req.Source, req.AuthorName, req.SourceURL, req.ExternalID,
		createdAt, createdAt,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to insert review: "+err.Error())
		return
	}

	id, _ := result.LastInsertId()
	writeJSON(w, http.StatusCreated, externalReviewResponse{
		ID:         id,
		ProductID:  req.ProductID,
		Title:      req.Title,
		Rating:     req.Rating,
		Source:     req.Source,
		AuthorName: req.AuthorName,
		ExternalID: req.ExternalID,
		CreatedAt:  createdAt,
	})
}

// ListSources returns a summary of imported review counts by source.
func (h *ExternalHandler) ListSources(w http.ResponseWriter, r *http.Request) {
	if !h.checkAuth(r) {
		w.Header().Set("WWW-Authenticate", `Basic realm="ReviewHub External API"`)
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT source, COUNT(*) AS total, MAX(created_at) AS last_import
		FROM reviews
		WHERE source IS NOT NULL
		GROUP BY source
		ORDER BY total DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	type row struct {
		Source     string    `json:"source"`
		Total      int       `json:"total"`
		LastImport time.Time `json:"last_import"`
	}
	var list []row
	for rows.Next() {
		var rw row
		rows.Scan(&rw.Source, &rw.Total, &rw.LastImport)
		list = append(list, rw)
	}
	if list == nil {
		list = []row{}
	}
	writeJSON(w, http.StatusOK, list)
}
