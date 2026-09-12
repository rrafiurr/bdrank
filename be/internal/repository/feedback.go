package repository

import (
	"context"
	"database/sql"
	"strings"

	"final-review/be/internal/feedback"
	"final-review/be/internal/models"
)

type FeedbackRepo struct {
	db *sql.DB
}

func NewFeedbackRepo(db *sql.DB) *FeedbackRepo {
	return &FeedbackRepo{db: db}
}

// NewFeedback is a validated, cleaned submission ready to store.
type NewFeedback struct {
	UserID    int64
	Type      string
	Message   string
	Hash      string
	PagePath  string // "" is stored as NULL
	UserAgent string // "" is stored as NULL
}

// FeedbackFilter narrows the admin inbox. An empty Status or Type means any.
type FeedbackFilter struct {
	Status string
	Type   string
	Limit  int
	Offset int
}

// AdmissionCounts returns the three numbers feedback.Admission decides on:
// items marked spam recently, recent items with the same fingerprint, and
// items still open. It reads only the user's own rows.
func (r *FeedbackRepo) AdmissionCounts(ctx context.Context, userID int64, hash string) (spam, dup, open int, err error) {
	err = r.db.QueryRowContext(ctx, `
		SELECT
		  COALESCE(SUM(status = 'spam' AND created_at > NOW() - INTERVAL ? DAY), 0),
		  COALESCE(SUM(message_hash = ? AND created_at > NOW() - INTERVAL ? DAY), 0),
		  COALESCE(SUM(status IN ('new','in_progress')), 0)
		FROM feedback WHERE user_id = ?`,
		feedback.SpamWindowDays, hash, feedback.DuplicateWindowDays, userID,
	).Scan(&spam, &dup, &open)
	return
}

const feedbackUserCols = `id, type, message, status, COALESCE(admin_reply,''), replied_at, reply_unread, created_at`

func scanUserFeedback(s interface{ Scan(...any) error }) (models.Feedback, error) {
	var f models.Feedback
	var replied sql.NullTime
	var unread int
	if err := s.Scan(&f.ID, &f.Type, &f.Message, &f.Status, &f.AdminReply, &replied, &unread, &f.CreatedAt); err != nil {
		return f, err
	}
	f.Status = feedback.PublicStatus(f.Status)
	if replied.Valid {
		t := replied.Time
		f.RepliedAt = &t
	}
	f.ReplyUnread = unread == 1
	return f, nil
}

// Create stores a submission and returns it as its author sees it.
func (r *FeedbackRepo) Create(ctx context.Context, in NewFeedback) (*models.Feedback, error) {
	res, err := r.db.ExecContext(ctx, `
		INSERT INTO feedback (user_id, type, message, message_hash, page_path, user_agent)
		VALUES (?, ?, ?, ?, NULLIF(?, ''), NULLIF(?, ''))`,
		in.UserID, in.Type, in.Message, in.Hash, in.PagePath, in.UserAgent)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	f, err := scanUserFeedback(r.db.QueryRowContext(ctx,
		`SELECT `+feedbackUserCols+` FROM feedback WHERE id = ?`, id))
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// ListMine returns the user's newest items, at most limit of them.
func (r *FeedbackRepo) ListMine(ctx context.Context, userID int64, limit int) ([]models.Feedback, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT `+feedbackUserCols+` FROM feedback WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
		userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []models.Feedback{}
	for rows.Next() {
		f, err := scanUserFeedback(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, f)
	}
	return list, rows.Err()
}

// UnreadCount is how many of the user's items carry a reply they have not seen.
func (r *FeedbackRepo) UnreadCount(ctx context.Context, userID int64) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM feedback WHERE user_id = ? AND reply_unread = 1`, userID).Scan(&n)
	return n, err
}

// MarkSeen clears the unread flag on all the user's replies.
func (r *FeedbackRepo) MarkSeen(ctx context.Context, userID int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE feedback SET reply_unread = 0 WHERE user_id = ? AND reply_unread = 1`, userID)
	return err
}

// AdminList returns one page of the inbox, newest first, and the total that
// matches the filter.
func (r *FeedbackRepo) AdminList(ctx context.Context, f FeedbackFilter) ([]models.AdminFeedback, int, error) {
	where := []string{"1=1"}
	args := []any{}
	if f.Status != "" {
		where = append(where, "f.status = ?")
		args = append(args, f.Status)
	}
	if f.Type != "" {
		where = append(where, "f.type = ?")
		args = append(args, f.Type)
	}
	cond := strings.Join(where, " AND ")

	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM feedback f WHERE `+cond, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	rows, err := r.db.QueryContext(ctx, `
		SELECT f.id, f.type, f.message, f.status, COALESCE(f.admin_reply,''), f.replied_at, f.reply_unread,
		       COALESCE(f.page_path,''), COALESCE(f.user_agent,''),
		       u.id, COALESCE(u.username,''), u.email, f.created_at
		FROM feedback f
		JOIN users u ON u.id = f.user_id
		WHERE `+cond+`
		ORDER BY f.created_at DESC, f.id DESC
		LIMIT ? OFFSET ?`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	list := []models.AdminFeedback{}
	for rows.Next() {
		var a models.AdminFeedback
		var replied sql.NullTime
		var unread int
		if err := rows.Scan(&a.ID, &a.Type, &a.Message, &a.Status, &a.AdminReply, &replied, &unread,
			&a.PagePath, &a.UserAgent, &a.User.ID, &a.User.Username, &a.User.Email, &a.CreatedAt); err != nil {
			return nil, 0, err
		}
		if replied.Valid {
			t := replied.Time
			a.RepliedAt = &t
		}
		a.ReplyUnread = unread == 1
		list = append(list, a)
	}
	return list, total, rows.Err()
}

// AdminUpdate sets the status and/or the reply. A nil pointer leaves that
// field alone. A reply that differs from the stored one is stamped with the
// time and flagged unread for the user; an empty reply removes it; saving
// identical text changes nothing, so it cannot re-notify the user.
func (r *FeedbackRepo) AdminUpdate(ctx context.Context, id int64, status, reply *string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var current sql.NullString
	err = tx.QueryRowContext(ctx, `SELECT admin_reply FROM feedback WHERE id = ? FOR UPDATE`, id).Scan(&current)
	if err == sql.ErrNoRows {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	if status != nil {
		if _, err := tx.ExecContext(ctx, `UPDATE feedback SET status = ? WHERE id = ?`, *status, id); err != nil {
			return err
		}
	}
	if reply != nil && *reply != current.String {
		if *reply == "" {
			_, err = tx.ExecContext(ctx,
				`UPDATE feedback SET admin_reply = NULL, replied_at = NULL, reply_unread = 0 WHERE id = ?`, id)
		} else {
			_, err = tx.ExecContext(ctx,
				`UPDATE feedback SET admin_reply = ?, replied_at = NOW(), reply_unread = 1 WHERE id = ?`, *reply, id)
		}
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
