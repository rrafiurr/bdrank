package repository

import (
	"context"
	"database/sql"

	"final-review/be/internal/models"
)

type CommentRepo struct {
	db      *sql.DB
	baseURL string
}

func NewCommentRepo(db *sql.DB, baseURL string) *CommentRepo {
	return &CommentRepo{db: db, baseURL: baseURL}
}

func (r *CommentRepo) Create(ctx context.Context, reviewID, userID int64, content string) (*models.Comment, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO comments (review_id, user_id, content) VALUES (?, ?, ?)`,
		reviewID, userID, content,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()

	var cm models.Comment
	var aID, reviewAuthorID int64
	var username, avatarURL string
	var reviewIsAnon int
	err = r.db.QueryRowContext(ctx, `
		SELECT c.id, c.content, 0, u.id, COALESCE(u.username,''), COALESCE(u.avatar_url,''), c.created_at,
		       rv.user_id, rv.is_anonymous
		FROM comments c
		INNER JOIN users u ON c.user_id = u.id
		INNER JOIN reviews rv ON rv.id = c.review_id
		WHERE c.id = ?`, id,
	).Scan(&cm.ID, &cm.Content, &cm.LikesCount, &aID, &username, &avatarURL, &cm.CreatedAt,
		&reviewAuthorID, &reviewIsAnon)
	if err != nil {
		return nil, err
	}
	cm.AuthorUserID = aID
	cm.Author = &models.AuthorRef{ID: aID, Username: username, AvatarURL: absURL(r.baseURL, avatarURL)}

	// A one-element slice so the same masking rule applies here as in the
	// thread listing — one implementation, not two.
	out := []models.Comment{cm}
	maskCommentAuthors(out, reviewAuthorID, reviewIsAnon == 1)
	return &out[0], nil
}

func (r *CommentRepo) ToggleLike(ctx context.Context, commentID, userID int64) (bool, int, error) {
	var exists int
	r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM comment_likes WHERE comment_id = ? AND user_id = ?`,
		commentID, userID,
	).Scan(&exists)

	if exists > 0 {
		r.db.ExecContext(ctx, `DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?`, commentID, userID)
	} else {
		r.db.ExecContext(ctx, `INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)`, commentID, userID)
	}

	var count int
	r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM comment_likes WHERE comment_id = ?`, commentID).Scan(&count)
	return exists == 0, count, nil
}

func (r *CommentRepo) Exists(ctx context.Context, id int64) bool {
	var count int
	r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM comments WHERE id = ?`, id).Scan(&count)
	return count > 0
}
