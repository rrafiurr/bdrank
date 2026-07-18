package rewards

import (
	"context"
	"database/sql"
	"errors"
)

type Repo struct{ db *sql.DB }

func NewRepo(db *sql.DB) *Repo { return &Repo{db: db} }

func (r *Repo) RuleByType(ctx context.Context, eventType string) (*Rule, error) {
	var ru Rule
	err := r.db.QueryRowContext(ctx,
		`SELECT id, event_type, points, daily_cap, lifetime_cap, is_active, updated_at
		 FROM reward_rules WHERE event_type = ?`, eventType,
	).Scan(&ru.ID, &ru.EventType, &ru.Points, &ru.DailyCap, &ru.LifetimeCap, &ru.IsActive, &ru.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &ru, nil
}

func (r *Repo) CountToday(ctx context.Context, userID int64, eventType string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM reward_transactions
		 WHERE user_id = ? AND event_type = ? AND created_at >= UTC_DATE()`,
		userID, eventType,
	).Scan(&n)
	return n, err
}

func (r *Repo) CountLifetime(ctx context.Context, userID int64, eventType string) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM reward_transactions WHERE user_id = ? AND event_type = ?`,
		userID, eventType,
	).Scan(&n)
	return n, err
}

// ApplyAward inserts a positive ledger row and upserts the balance atomically.
func (r *Repo) ApplyAward(ctx context.Context, userID int64, eventType, refType string, refID int64, points int) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var refIDArg any
	if refID != 0 {
		refIDArg = refID
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, eventType, points, refType, refIDArg,
	); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_balances (user_id, points, lifetime_points)
		 VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE points = points + VALUES(points),
		                         lifetime_points = lifetime_points + VALUES(lifetime_points)`,
		userID, points, points,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repo) Balance(ctx context.Context, userID int64) (int, int, error) {
	var points, lifetime int
	err := r.db.QueryRowContext(ctx,
		`SELECT points, lifetime_points FROM reward_balances WHERE user_id = ?`, userID,
	).Scan(&points, &lifetime)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, 0, nil
	}
	return points, lifetime, err
}

func (r *Repo) listLevels(ctx context.Context, activeOnly bool) ([]Level, error) {
	q := `SELECT id, name, min_points, icon, color, is_active FROM reward_levels`
	if activeOnly {
		q += ` WHERE is_active = 1`
	}
	q += ` ORDER BY min_points ASC`
	rows, err := r.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Level
	for rows.Next() {
		var l Level
		if err := rows.Scan(&l.ID, &l.Name, &l.MinPoints, &l.Icon, &l.Color, &l.IsActive); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *Repo) ListActiveLevels(ctx context.Context) ([]Level, error) { return r.listLevels(ctx, true) }
func (r *Repo) ListAllLevels(ctx context.Context) ([]Level, error)    { return r.listLevels(ctx, false) }

func (r *Repo) Transactions(ctx context.Context, userID int64, limit, offset int) ([]Transaction, int, error) {
	var total int
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM reward_transactions WHERE user_id = ?`, userID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, event_type, points, ref_type, ref_id, note, created_at
		 FROM reward_transactions WHERE user_id = ?
		 ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var out []Transaction
	for rows.Next() {
		var t Transaction
		if err := rows.Scan(&t.ID, &t.EventType, &t.Points, &t.RefType, &t.RefID, &t.Note, &t.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, t)
	}
	return out, total, rows.Err()
}
