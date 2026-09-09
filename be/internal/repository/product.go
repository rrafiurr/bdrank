package repository

import (
	"context"
	"database/sql"

	"final-review/be/internal/models"
)

type ProductRepo struct {
	db      *sql.DB
	baseURL string
}

func NewProductRepo(db *sql.DB, baseURL string) *ProductRepo {
	return &ProductRepo{db: db, baseURL: baseURL}
}

type ProductFilter struct {
	Category string
	Query    string
	Sort     string
	// Placement scopes the list to a surface with its own rules. "home"
	// excludes hidden products and floats pinned ones; anything else, empty
	// included, leaves the list exactly as it has always behaved.
	Placement string
	Limit     int
	Offset    int
}

// productOrderBy maps the public sort parameter to an ORDER BY clause. It is
// a closed set: anything unrecognised falls back to most-reviewed, so the
// value can never reach the query as free text.
// ValidHomePlacement reports whether v is one of the three placement values.
// The admin handler uses it so an unknown value is rejected rather than
// written to the column.
func ValidHomePlacement(v string) bool {
	return v == "auto" || v == "pinned" || v == "hidden"
}

// placementOrderPrefix returns the ORDER BY fragment that floats pinned
// products to the front. Only the explicit "home" placement asks for it, so
// search, browse and the CMS table keep the ordering they have today.
func placementOrderPrefix(placement string) string {
	if placement == "home" {
		return "(p.home_placement = 'pinned') DESC, "
	}
	return ""
}

// placementWhere excludes products kept off the home page. Applied only for
// "home": the CMS reads the same public list endpoint, so filtering hidden
// products everywhere would make them impossible to un-hide.
func placementWhere(placement string) string {
	if placement == "home" {
		return " AND p.home_placement <> 'hidden'"
	}
	return ""
}

func productOrderBy(sort string) string {
	switch sort {
	case "avg_rating":
		return "avg_rating DESC"
	case "created_at":
		return "p.created_at DESC"
	case "recent_review":
		// Newest review activity first. Products with no approved review have
		// a NULL max, which MySQL sorts last under DESC.
		return "MAX(r.created_at) DESC"
	default:
		return "review_count DESC"
	}
}

func (r *ProductRepo) List(ctx context.Context, f ProductFilter) ([]*models.Product, int, error) {
	if f.Limit == 0 {
		f.Limit = 12
	}

	orderBy := placementOrderPrefix(f.Placement) + productOrderBy(f.Sort)

	whereClause := "WHERE 1=1" + placementWhere(f.Placement)
	args := []any{}
	if f.Category != "" {
		whereClause += " AND p.category = ?"
		args = append(args, f.Category)
	}
	if f.Query != "" {
		whereClause += " AND p.name LIKE ?"
		args = append(args, "%"+f.Query+"%")
	}

	query := `
		SELECT p.id, p.name, p.category, COALESCE(p.image_url,''),
		       COUNT(r.id) as review_count,
		       COALESCE(AVG(r.rating), 0) as avg_rating,
		       COALESCE(p.created_at, NOW()), p.home_placement
		FROM products p
		LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
		` + whereClause + `
		GROUP BY p.id, p.name, p.category, p.image_url, p.created_at, p.home_placement
		ORDER BY ` + orderBy + `
		LIMIT ? OFFSET ?`

	rows, err := r.db.QueryContext(ctx, query, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var products []*models.Product
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(&p.ID, &p.Name, &p.Category, &p.ImageURL,
			&p.ReviewCount, &p.AvgRating, &p.CreatedAt, &p.HomePlacement); err != nil {
			return nil, 0, err
		}
		p.ImageURL = absURL(r.baseURL, p.ImageURL)
		products = append(products, &p)
	}
	if products == nil {
		products = []*models.Product{}
	}

	var total int
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT p.id) FROM products p LEFT JOIN reviews r ON p.id = r.product_id `+whereClause,
		args...,
	).Scan(&total)

	return products, total, nil
}

func (r *ProductRepo) FindByID(ctx context.Context, id int64) (*models.Product, error) {
	var p models.Product
	err := r.db.QueryRowContext(ctx, `
		SELECT p.id, p.name, p.category, COALESCE(p.image_url,''),
		       COUNT(r.id), COALESCE(AVG(r.rating), 0), COALESCE(p.created_at, NOW()),
		       p.home_placement
		FROM products p
		LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
		WHERE p.id = ?
		GROUP BY p.id, p.name, p.category, p.image_url, p.created_at, p.home_placement`, id,
	).Scan(&p.ID, &p.Name, &p.Category, &p.ImageURL, &p.ReviewCount, &p.AvgRating, &p.CreatedAt,
		&p.HomePlacement)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	p.ImageURL = absURL(r.baseURL, p.ImageURL)
	return &p, err
}

func (r *ProductRepo) Exists(ctx context.Context, id int64) bool {
	var count int
	r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM products WHERE id = ?`, id).Scan(&count)
	return count > 0
}

func (r *ProductRepo) FindOrCreate(ctx context.Context, name, category string) (*models.Product, error) {
	var p models.Product
	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, category, COALESCE(image_url,''), COALESCE(created_at, NOW()) FROM products WHERE name = ? AND category = ?`,
		name, category,
	).Scan(&p.ID, &p.Name, &p.Category, &p.ImageURL, &p.CreatedAt)
	if err == nil {
		return &p, nil
	}
	if err != sql.ErrNoRows {
		return nil, err
	}
	res, err := r.db.ExecContext(ctx, `INSERT INTO products (name, category) VALUES (?, ?)`, name, category)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return r.FindByID(ctx, id)
}

func (r *ProductRepo) ListCategories(ctx context.Context) ([]*models.Category, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT slug, label FROM categories ORDER BY label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []*models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.Slug, &c.Label); err != nil {
			return nil, err
		}
		cats = append(cats, &c)
	}
	if cats == nil {
		cats = []*models.Category{}
	}
	return cats, nil
}

// OwnedBy returns true if the product exists and its owner_id matches userID.
func (r *ProductRepo) OwnedBy(ctx context.Context, productID, userID int64) bool {
	var count int
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM products WHERE id = ? AND owner_id = ?`, productID, userID,
	).Scan(&count)
	return count > 0
}

func (r *ProductRepo) CategoryStats(ctx context.Context) ([]*models.CategoryStat, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT p.category, COUNT(r.id) as review_count
		FROM products p
		LEFT JOIN reviews r ON p.id = r.product_id AND r.is_approved = 1
		GROUP BY p.category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []*models.CategoryStat
	for rows.Next() {
		var s models.CategoryStat
		if err := rows.Scan(&s.Category, &s.ReviewCount); err != nil {
			return nil, err
		}
		stats = append(stats, &s)
	}
	if stats == nil {
		stats = []*models.CategoryStat{}
	}
	return stats, nil
}
