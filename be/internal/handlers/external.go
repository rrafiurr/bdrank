package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"final-review/be/internal/storage"
)

type ExternalHandler struct {
	db       *sql.DB
	username string
	password string
	storage  storage.Storage
}

func NewExternalHandler(db *sql.DB, username, password string, s storage.Storage) *ExternalHandler {
	return &ExternalHandler{db: db, username: username, password: password, storage: s}
}

// maxImportImageBytes caps each re-hosted review photo.
const maxImportImageBytes = 8 << 20

// importImageClient is kept separate from http.DefaultClient so a slow source
// host cannot tie up an import request indefinitely.
var importImageClient = &http.Client{Timeout: 20 * time.Second}

// allowedImageHost reports whether we are willing to fetch a review photo from
// this URL. Imported photos come from a small set of Google CDN domains;
// restricting to them keeps this endpoint from doubling as an open URL fetcher
// for anyone holding the external API password.
func allowedImageHost(u *url.URL) bool {
	if u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, suffix := range []string{"googleusercontent.com", "ggpht.com", "google.com"} {
		if host == suffix || strings.HasSuffix(host, "."+suffix) {
			return true
		}
	}
	return false
}

// rehostImage downloads a source photo and saves it through the configured
// Storage, returning the public URL of the stored copy. Storage.Store sniffs
// the content type, so non-image responses are rejected there.
func (h *ExternalHandler) rehostImage(ctx context.Context, rawURL string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", fmt.Errorf("invalid image URL: %w", err)
	}
	if !allowedImageHost(u) {
		return "", fmt.Errorf("image host not allowed: %q", u.Host)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	resp, err := importImageClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("source returned HTTP %d", resp.StatusCode)
	}

	stored, err := h.storage.Store(ctx, resp.Body, path.Base(u.Path), maxImportImageBytes)
	if err != nil {
		return "", err
	}
	return h.storage.URL(stored), nil
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
	Images       []string `json:"images"`    // source photo URLs, re-hosted on import
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
	Images     []string  `json:"images"`
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

	// Re-host each source photo and attach it. A photo that cannot be fetched
	// is skipped rather than failing the import — the review text is still
	// worth keeping, and the importer reports the shortfall in its summary.
	stored := []string{}
	for _, src := range req.Images {
		if src == "" {
			continue
		}
		publicURL, err := h.rehostImage(r.Context(), src)
		if err != nil {
			log.Printf("external import: review %d: skipping image %q: %v", id, src, err)
			continue
		}
		if _, err := h.db.ExecContext(r.Context(),
			`INSERT INTO review_images (review_id, url) VALUES (?, ?)`, id, publicURL); err != nil {
			log.Printf("external import: review %d: failed to attach image %q: %v", id, publicURL, err)
			continue
		}
		stored = append(stored, publicURL)
	}

	writeJSON(w, http.StatusCreated, externalReviewResponse{
		ID:         id,
		ProductID:  req.ProductID,
		Title:      req.Title,
		Rating:     req.Rating,
		Source:     req.Source,
		AuthorName: req.AuthorName,
		ExternalID: req.ExternalID,
		CreatedAt:  createdAt,
		Images:     stored,
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
