package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"
)

// Note: ApprovedAt uses *time.Time (not sql.NullTime) so it serialises as
// a JSON string or null — sql.NullTime would produce {"Time":…,"Valid":…}.

// EmbedToken is one row from embed_tokens, with joined product/owner names.
// JSON tags use snake_case so the FE receives show_rating etc. (not ShowRating).
type EmbedToken struct {
	ID            int64      `json:"id"`
	Token         string     `json:"token"`
	ProductID     int64      `json:"product_id"`
	OwnerID       int64      `json:"owner_id"`
	Domain        string     `json:"domain"`
	Status        string     `json:"status"`
	ShowRating    bool       `json:"show_rating"`
	ShowCount     bool       `json:"show_count"`
	ShowBreakdown bool       `json:"show_breakdown"`
	ShowSnippet   bool       `json:"show_snippet"`
	AdminNote     string     `json:"admin_note"`
	CreatedAt     time.Time  `json:"created_at"`
	ApprovedAt    *time.Time `json:"approved_at,omitempty"`
	ProductName   string     `json:"product_name"`
	OwnerEmail    string     `json:"owner_email,omitempty"`
	OwnerCompany  string     `json:"owner_company,omitempty"`
}

// WidgetData is the JSON payload returned by GET /api/v1/widget/{token}.
type WidgetData struct {
	Product      WidgetProduct  `json:"product"`
	AvgRating    float64        `json:"avg_rating"`
	ReviewCount  int            `json:"review_count"`
	Breakdown    map[string]int `json:"breakdown"`
	LatestReview *WidgetReview  `json:"latest_review,omitempty"`
	Config       WidgetConfig   `json:"config"`
}

type WidgetProduct struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	URL  string `json:"url"`
}

type WidgetReview struct {
	Title  string `json:"title"`
	Rating int    `json:"rating"`
	Date   string `json:"date"` // "2006-01" format
}

type WidgetConfig struct {
	ShowRating    bool `json:"show_rating"`
	ShowCount     bool `json:"show_count"`
	ShowBreakdown bool `json:"show_breakdown"`
	ShowSnippet   bool `json:"show_snippet"`
}

// CreateEmbedReq holds the fields for creating a new embed token.
type CreateEmbedReq struct {
	ProductID     int64
	OwnerID       int64
	Domain        string
	ShowRating    bool
	ShowCount     bool
	ShowBreakdown bool
	ShowSnippet   bool
}

type EmbedRepo struct {
	db      *sql.DB
	siteURL string // e.g. "https://bdranks.com" — used to build product URLs
}

func NewEmbedRepo(db *sql.DB, siteURL string) *EmbedRepo {
	return &EmbedRepo{db: db, siteURL: siteURL}
}

// Create generates a new token and inserts the embed request as "pending".
func (r *EmbedRepo) Create(ctx context.Context, req CreateEmbedReq) (*EmbedToken, error) {
	b := make([]byte, 24)
	rand.Read(b)
	token := hex.EncodeToString(b)

	_, err := r.db.ExecContext(ctx, `
		INSERT INTO embed_tokens
			(token, product_id, owner_id, domain, show_rating, show_count, show_breakdown, show_snippet)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		token, req.ProductID, req.OwnerID, req.Domain,
		boolInt(req.ShowRating), boolInt(req.ShowCount),
		boolInt(req.ShowBreakdown), boolInt(req.ShowSnippet),
	)
	if err != nil {
		return nil, err
	}
	return r.findByToken(ctx, token)
}

// ListByOwner returns all embed tokens owned by ownerID, newest first.
func (r *EmbedRepo) ListByOwner(ctx context.Context, ownerID int64) ([]*EmbedToken, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.token, e.product_id, e.owner_id, e.domain, e.status,
		       e.show_rating, e.show_count, e.show_breakdown, e.show_snippet,
		       e.admin_note, e.created_at, e.approved_at,
		       p.name AS product_name, '' AS owner_email, '' AS owner_company
		FROM embed_tokens e
		JOIN products p ON p.id = e.product_id
		WHERE e.owner_id = ?
		ORDER BY e.created_at DESC`, ownerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEmbedRows(rows)
}

// FindByToken looks up one embed token row by its token string.
func (r *EmbedRepo) FindByToken(ctx context.Context, token string) (*EmbedToken, error) {
	return r.findByToken(ctx, token)
}

// ListAll returns all embed tokens for admin use. Pass status="" for all statuses.
func (r *EmbedRepo) ListAll(ctx context.Context, status string) ([]*EmbedToken, error) {
	q := `
		SELECT e.id, e.token, e.product_id, e.owner_id, e.domain, e.status,
		       e.show_rating, e.show_count, e.show_breakdown, e.show_snippet,
		       e.admin_note, e.created_at, e.approved_at,
		       p.name AS product_name,
		       COALESCE(u.email,'') AS owner_email,
		       COALESCE(u.company_name,'') AS owner_company
		FROM embed_tokens e
		JOIN products p ON p.id = e.product_id
		JOIN users u ON u.id = e.owner_id`
	args := []any{}
	if status != "" {
		q += " WHERE e.status = ?"
		args = append(args, status)
	}
	q += " ORDER BY e.created_at DESC"

	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEmbedRows(rows)
}

// UpdateStatus sets status and admin_note on an embed token. Sets approved_at when approving.
func (r *EmbedRepo) UpdateStatus(ctx context.Context, id int64, status, adminNote string) error {
	var approvedAt *time.Time
	if status == "approved" {
		now := time.Now()
		approvedAt = &now
	}
	_, err := r.db.ExecContext(ctx,
		`UPDATE embed_tokens SET status = ?, admin_note = ?, approved_at = ? WHERE id = ?`,
		status, adminNote, approvedAt, id)
	return err
}

// GetWidgetData queries product summary data for a given approved token.
func (r *EmbedRepo) GetWidgetData(ctx context.Context, tok *EmbedToken) (*WidgetData, error) {
	var productName string
	var avgRating float64
	var reviewCount int
	err := r.db.QueryRowContext(ctx, `
		SELECT p.name, COALESCE(AVG(r.rating), 0), COUNT(r.id)
		FROM products p
		LEFT JOIN reviews r ON r.product_id = p.id AND r.is_approved = 1
		WHERE p.id = ?
		GROUP BY p.name`, tok.ProductID,
	).Scan(&productName, &avgRating, &reviewCount)
	if err != nil {
		return nil, fmt.Errorf("product query: %w", err)
	}

	// Rating breakdown: count per star (1-5)
	breakdown := map[string]int{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
	brows, err := r.db.QueryContext(ctx, `
		SELECT rating, COUNT(*) FROM reviews
		WHERE product_id = ? AND is_approved = 1
		GROUP BY rating`, tok.ProductID)
	if err != nil {
		return nil, fmt.Errorf("breakdown query: %w", err)
	}
	defer brows.Close()
	for brows.Next() {
		var star, count int
		brows.Scan(&star, &count)
		breakdown[fmt.Sprintf("%d", star)] = count
	}

	// Latest review snippet (only when ShowSnippet is on)
	var latestReview *WidgetReview
	if tok.ShowSnippet {
		var title string
		var rating int
		var createdAt time.Time
		err := r.db.QueryRowContext(ctx, `
			SELECT title, rating, COALESCE(created_at, NOW())
			FROM reviews
			WHERE product_id = ? AND is_approved = 1
			ORDER BY created_at DESC LIMIT 1`, tok.ProductID,
		).Scan(&title, &rating, &createdAt)
		if err == nil {
			latestReview = &WidgetReview{
				Title:  title,
				Rating: rating,
				Date:   createdAt.Format("2006-01"),
			}
		}
	}

	return &WidgetData{
		Product: WidgetProduct{
			ID:   tok.ProductID,
			Name: productName,
			URL:  fmt.Sprintf("%s/product/%d", r.siteURL, tok.ProductID),
		},
		AvgRating:    avgRating,
		ReviewCount:  reviewCount,
		Breakdown:    breakdown,
		LatestReview: latestReview,
		Config: WidgetConfig{
			ShowRating:    tok.ShowRating,
			ShowCount:     tok.ShowCount,
			ShowBreakdown: tok.ShowBreakdown,
			ShowSnippet:   tok.ShowSnippet,
		},
	}, nil
}

func (r *EmbedRepo) findByToken(ctx context.Context, token string) (*EmbedToken, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT e.id, e.token, e.product_id, e.owner_id, e.domain, e.status,
		       e.show_rating, e.show_count, e.show_breakdown, e.show_snippet,
		       e.admin_note, e.created_at, e.approved_at,
		       p.name AS product_name, '' AS owner_email, '' AS owner_company
		FROM embed_tokens e
		JOIN products p ON p.id = e.product_id
		WHERE e.token = ?`, token)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	toks, err := scanEmbedRows(rows)
	if err != nil {
		return nil, err
	}
	if len(toks) == 0 {
		return nil, ErrNotFound
	}
	return toks[0], nil
}

func scanEmbedRows(rows *sql.Rows) ([]*EmbedToken, error) {
	var result []*EmbedToken
	for rows.Next() {
		var tok EmbedToken
		var showRating, showCount, showBreakdown, showSnippet int
		var approvedAt sql.NullTime
		if err := rows.Scan(
			&tok.ID, &tok.Token, &tok.ProductID, &tok.OwnerID, &tok.Domain, &tok.Status,
			&showRating, &showCount, &showBreakdown, &showSnippet,
			&tok.AdminNote, &tok.CreatedAt, &approvedAt,
			&tok.ProductName, &tok.OwnerEmail, &tok.OwnerCompany,
		); err != nil {
			return nil, err
		}
		tok.ShowRating = showRating == 1
		tok.ShowCount = showCount == 1
		tok.ShowBreakdown = showBreakdown == 1
		tok.ShowSnippet = showSnippet == 1
		if approvedAt.Valid {
			tok.ApprovedAt = &approvedAt.Time
		}
		result = append(result, &tok)
	}
	if result == nil {
		result = []*EmbedToken{}
	}
	return result, nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
