package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"final-review/be/internal/models"
)

type ReviewRepo struct {
	db      *sql.DB
	baseURL string
}

func NewReviewRepo(db *sql.DB, baseURL string) *ReviewRepo {
	return &ReviewRepo{db: db, baseURL: baseURL}
}

type ReviewFilter struct {
	Category     string
	Query        string
	MinRating    int
	Sort         string
	Limit        int
	Offset       int
	TimelineOnly bool
	ProductID    int64
}

func (r *ReviewRepo) List(ctx context.Context, f ReviewFilter) ([]*models.Review, int, error) {
	if f.Limit == 0 {
		f.Limit = 20
	}

	conditions := []string{"r.is_approved = 1"}
	args := []any{}

	if f.Category != "" {
		conditions = append(conditions, "p.category = ?")
		args = append(args, f.Category)
	}
	if f.MinRating > 0 {
		conditions = append(conditions, "r.rating >= ?")
		args = append(args, f.MinRating)
	}
	if f.Query != "" {
		like := "%" + f.Query + "%"
		conditions = append(conditions, "(r.title LIKE ? OR p.name LIKE ? OR u.username LIKE ?)")
		args = append(args, like, like, like)
	}
	if f.ProductID > 0 {
		conditions = append(conditions, "r.product_id = ?")
		args = append(args, f.ProductID)
	}

	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	having := ""
	if f.TimelineOnly {
		having = "HAVING COUNT(DISTINCT te.id) > 0"
	}

	orderBy := "r.created_at DESC"
	switch f.Sort {
	case "popular", "most_liked":
		orderBy = "likes_count DESC"
	case "rating", "highest":
		orderBy = "r.rating DESC"
	case "lowest":
		orderBy = "r.rating ASC"
	case "comments":
		orderBy = "comments_count DESC"
	case "oldest":
		orderBy = "r.created_at ASC"
	}

	dataQuery := fmt.Sprintf(`
		SELECT
			r.id, r.title, LEFT(r.content, 200) AS excerpt, r.rating, p.category,
			p.id, p.name,
			u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''),
			COUNT(DISTINCT rl.user_id) AS likes_count,
			COUNT(DISTINCT c.id)       AS comments_count,
			(COUNT(DISTINCT te.id) > 0) AS is_timeline,
			COUNT(DISTINCT te.id)      AS timeline_updates_count,
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			r.created_at, r.is_approved
		FROM reviews r
		INNER JOIN products p ON r.product_id = p.id
		INNER JOIN users u ON r.user_id = u.id
		LEFT JOIN review_likes rl ON r.id = rl.review_id
		LEFT JOIN comments c ON r.id = c.review_id AND c.is_approved = 1
		LEFT JOIN timeline_entries te ON r.id = te.review_id
		LEFT JOIN review_images ri ON r.id = ri.review_id
		%s
		GROUP BY r.id, r.title, r.content, r.rating, p.category, p.id, p.name,
		         u.id, u.username, u.avatar_url, r.created_at, r.is_approved
		%s
		ORDER BY %s
		LIMIT ? OFFSET ?`, whereClause, having, orderBy)

	rows, err := r.db.QueryContext(ctx, dataQuery, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var reviews []*models.Review
	for rows.Next() {
		var rv models.Review
		var productID int64
		var productName string
		var authorID int64
		var username, avatarURL string
		var isTimeline, isApproved int
		var imagesStr sql.NullString

		if err := rows.Scan(
			&rv.ID, &rv.Title, &rv.Excerpt, &rv.Rating, &rv.Category,
			&productID, &productName,
			&authorID, &username, &avatarURL,
			&rv.LikesCount, &rv.CommentsCount,
			&isTimeline, &rv.TimelineUpdatesCount,
			&imagesStr, &rv.CreatedAt, &isApproved,
		); err != nil {
			return nil, 0, err
		}
		rv.Product = &models.ProductRef{ID: productID, Name: productName}
		rv.Author = &models.AuthorRef{ID: authorID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
		rv.IsTimeline = isTimeline == 1
		rv.IsApproved = isApproved == 1
		rv.Images = absURLSlice(r.baseURL, splitImages(imagesStr))
		reviews = append(reviews, &rv)
	}
	if reviews == nil {
		reviews = []*models.Review{}
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) FROM (
			SELECT r.id
			FROM reviews r
			INNER JOIN products p ON r.product_id = p.id
			INNER JOIN users u ON r.user_id = u.id
			LEFT JOIN timeline_entries te ON r.id = te.review_id
			%s
			GROUP BY r.id
			%s
		) AS sub`, whereClause, having)
	var total int
	r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)

	return reviews, total, nil
}

func (r *ReviewRepo) FindByID(ctx context.Context, id int64) (*models.Review, error) {
	var rv models.Review
	var productID int64
	var productName, productImageURL string
	var authorID int64
	var username, avatarURL string
	var isTimeline, isApproved int
	var imagesStr sql.NullString

	err := r.db.QueryRowContext(ctx, `
		SELECT
			r.id, r.title, r.content, r.rating, p.category, r.views_count,
			p.id, p.name, COALESCE(p.image_url,''),
			u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''),
			COUNT(DISTINCT rl.user_id) AS likes_count,
			COUNT(DISTINCT c.id)       AS comments_count,
			(COUNT(DISTINCT te.id) > 0) AS is_timeline,
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			r.is_approved
		FROM reviews r
		INNER JOIN products p ON r.product_id = p.id
		INNER JOIN users u ON r.user_id = u.id
		LEFT JOIN review_likes rl ON r.id = rl.review_id
		LEFT JOIN comments c ON r.id = c.review_id AND c.is_approved = 1
		LEFT JOIN timeline_entries te ON r.id = te.review_id
		LEFT JOIN review_images ri ON r.id = ri.review_id
		WHERE r.id = ? AND r.is_approved = 1
		GROUP BY r.id, r.title, r.content, r.rating, p.category, r.views_count,
		         p.id, p.name, p.image_url, u.id, u.username, u.avatar_url, r.is_approved`, id,
	).Scan(
		&rv.ID, &rv.Title, &rv.Content, &rv.Rating, &rv.Category, &rv.ViewsCount,
		&productID, &productName, &productImageURL,
		&authorID, &username, &avatarURL,
		&rv.LikesCount, &rv.CommentsCount, &isTimeline, &imagesStr, &isApproved,
	)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	rv.Product = &models.ProductRef{ID: productID, Name: productName, ImageURL: absURL(r.baseURL, productImageURL)}
	rv.Author = &models.AuthorRef{ID: authorID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
	rv.IsApproved = isApproved == 1
	rv.IsTimeline = isTimeline == 1
	rv.Images = absURLSlice(r.baseURL, splitImages(imagesStr))

	teRows, err := r.db.QueryContext(ctx,
		`SELECT id, title, content, rating, COALESCE(image_url,''), created_at
		 FROM timeline_entries WHERE review_id = ? ORDER BY created_at ASC`, id)
	if err == nil {
		defer teRows.Close()
		for teRows.Next() {
			var te models.TimelineEntry
			teRows.Scan(&te.ID, &te.Title, &te.Content, &te.Rating, &te.ImageURL, &te.CreatedAt)
			te.ImageURL = absURL(r.baseURL, te.ImageURL)
			rv.Timeline = append(rv.Timeline, te)
		}
	}
	if rv.Timeline == nil {
		rv.Timeline = []models.TimelineEntry{}
	}

	cRows, err := r.db.QueryContext(ctx, `
		SELECT c.id, c.content, COUNT(DISTINCT cl.user_id) AS likes_count,
		       u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''), c.created_at,
		       (p.owner_id = u.id AND u.is_product_owner = 1 AND u.owner_verified = 1) AS is_owner_reply,
		       COALESCE(u.company_name,'') AS company_name
		FROM comments c
		INNER JOIN users u ON c.user_id = u.id
		INNER JOIN reviews rv2 ON rv2.id = c.review_id
		INNER JOIN products p ON p.id = rv2.product_id
		LEFT JOIN comment_likes cl ON c.id = cl.comment_id
		WHERE c.review_id = ? AND c.is_approved = 1
		GROUP BY c.id, c.content, u.id, u.username, u.avatar_url, c.created_at,
		         p.owner_id, u.is_product_owner, u.owner_verified, u.company_name
		ORDER BY c.created_at ASC`, id)
	if err == nil {
		defer cRows.Close()
		for cRows.Next() {
			var cm models.Comment
			var aID int64
			var aUsername, aAvatarURL string
			var isOwnerReply int
			cRows.Scan(&cm.ID, &cm.Content, &cm.LikesCount, &aID, &aUsername, &aAvatarURL, &cm.CreatedAt,
				&isOwnerReply, &cm.CompanyName)
			cm.Author = &models.AuthorRef{ID: aID, Username: aUsername, AvatarURL: absURL(r.baseURL, aAvatarURL)}
			cm.IsOwnerReply = isOwnerReply == 1
			rv.Comments = append(rv.Comments, cm)
		}
	}
	if rv.Comments == nil {
		rv.Comments = []models.Comment{}
	}

	return &rv, nil
}

func (r *ReviewRepo) Create(ctx context.Context, userID, productID int64, title, content string, rating int) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reviews (user_id, product_id, title, content, rating) VALUES (?, ?, ?, ?, ?)`,
		userID, productID, title, content, rating,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *ReviewRepo) AddImage(ctx context.Context, reviewID int64, url string) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO review_images (review_id, url) VALUES (?, ?)`, reviewID, url)
	return err
}

func (r *ReviewRepo) ToggleLike(ctx context.Context, reviewID, userID int64) (bool, int, error) {
	var exists int
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM review_likes WHERE review_id = ? AND user_id = ?`,
		reviewID, userID,
	).Scan(&exists)

	if exists > 0 {
		r.db.ExecContext(ctx, `DELETE FROM review_likes WHERE review_id = ? AND user_id = ?`, reviewID, userID)
	} else {
		r.db.ExecContext(ctx, `INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)`, reviewID, userID)
	}

	var count int
	r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM review_likes WHERE review_id = ?`, reviewID).Scan(&count)
	return exists == 0, count, nil
}

func (r *ReviewRepo) IncrementViews(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `UPDATE reviews SET views_count = views_count + 1 WHERE id = ?`, id)
	return err
}

func (r *ReviewRepo) AddTimelineEntry(ctx context.Context, reviewID int64, title, content string, rating int, imageURL string) (*models.TimelineEntry, error) {
	var imgArg any
	if imageURL != "" {
		imgArg = imageURL
	}
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO timeline_entries (review_id, title, content, rating, image_url) VALUES (?, ?, ?, ?, ?)`,
		reviewID, title, content, rating, imgArg,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	var te models.TimelineEntry
	r.db.QueryRowContext(ctx,
		`SELECT id, title, content, rating, COALESCE(image_url,''), created_at FROM timeline_entries WHERE id = ?`, id,
	).Scan(&te.ID, &te.Title, &te.Content, &te.Rating, &te.ImageURL, &te.CreatedAt)
	te.ImageURL = absURL(r.baseURL, te.ImageURL)
	return &te, nil
}

func (r *ReviewRepo) Exists(ctx context.Context, id int64) bool {
	var count int
	r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM reviews WHERE id = ?`, id).Scan(&count)
	return count > 0
}

func (r *ReviewRepo) IsAuthor(ctx context.Context, reviewID, userID int64) bool {
	var count int
	r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM reviews WHERE id = ? AND user_id = ?`, reviewID, userID).Scan(&count)
	return count > 0
}

func (r *ReviewRepo) ListByOwner(ctx context.Context, ownerID, productID int64, limit, offset int) ([]*models.Review, int, error) {
	if limit == 0 {
		limit = 20
	}

	conditions := []string{"r.is_approved = 1", "p.owner_id = ?"}
	args := []any{ownerID}
	if productID > 0 {
		conditions = append(conditions, "r.product_id = ?")
		args = append(args, productID)
	}
	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	dataQuery := fmt.Sprintf(`
		SELECT
			r.id, r.title, LEFT(r.content, 200) AS excerpt, r.rating, p.category,
			p.id, p.name,
			u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''),
			COUNT(DISTINCT rl.user_id) AS likes_count,
			COUNT(DISTINCT c.id)       AS comments_count,
			(COUNT(DISTINCT te.id) > 0) AS is_timeline,
			COUNT(DISTINCT te.id)      AS timeline_updates_count,
			GROUP_CONCAT(DISTINCT ri.url ORDER BY ri.id SEPARATOR '|') AS images,
			r.created_at, r.is_approved
		FROM reviews r
		INNER JOIN products p ON r.product_id = p.id
		INNER JOIN users u ON r.user_id = u.id
		LEFT JOIN review_likes rl ON r.id = rl.review_id
		LEFT JOIN comments c ON r.id = c.review_id AND c.is_approved = 1
		LEFT JOIN timeline_entries te ON r.id = te.review_id
		LEFT JOIN review_images ri ON r.id = ri.review_id
		%s
		GROUP BY r.id, r.title, r.content, r.rating, p.category,
		         p.id, p.name, u.id, u.username, u.avatar_url, r.created_at, r.is_approved
		ORDER BY r.created_at DESC
		LIMIT ? OFFSET ?`, whereClause)

	rows, err := r.db.QueryContext(ctx, dataQuery, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var reviews []*models.Review
	for rows.Next() {
		var rv models.Review
		var pID int64
		var pName string
		var aID int64
		var username, avatarURL string
		var isTimeline, isApproved int
		var imagesStr sql.NullString

		if err := rows.Scan(
			&rv.ID, &rv.Title, &rv.Excerpt, &rv.Rating, &rv.Category,
			&pID, &pName,
			&aID, &username, &avatarURL,
			&rv.LikesCount, &rv.CommentsCount,
			&isTimeline, &rv.TimelineUpdatesCount,
			&imagesStr, &rv.CreatedAt, &isApproved,
		); err != nil {
			return nil, 0, err
		}
		rv.Product = &models.ProductRef{ID: pID, Name: pName}
		rv.Author = &models.AuthorRef{ID: aID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}
		rv.IsTimeline = isTimeline == 1
		rv.IsApproved = isApproved == 1
		rv.Images = absURLSlice(r.baseURL, splitImages(imagesStr))
		reviews = append(reviews, &rv)
	}
	if reviews == nil {
		reviews = []*models.Review{}
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(*) FROM (
			SELECT r.id
			FROM reviews r
			INNER JOIN products p ON r.product_id = p.id
			%s
			GROUP BY r.id
		) AS sub`, whereClause)
	var total int
	r.db.QueryRowContext(ctx, countQuery, args...).Scan(&total)

	return reviews, total, nil
}

func splitImages(s sql.NullString) []string {
	if !s.Valid || s.String == "" {
		return []string{}
	}
	return strings.Split(s.String, "|")
}
