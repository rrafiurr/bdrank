package rewards

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

func nowUTC() time.Time { return time.Now().UTC() }

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

// ── items ───────────────────────────────────────────────────────────────
func (r *Repo) ListItems(ctx context.Context, activeOnly bool) ([]Item, error) {
	q := `SELECT id, name, description, image_url, points_cost, fulfillment_type, stock, is_active
	      FROM reward_items`
	if activeOnly {
		q += ` WHERE is_active = 1`
	}
	q += ` ORDER BY created_at DESC`
	rows, err := r.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.Name, &it.Description, &it.ImageURL, &it.PointsCost,
			&it.FulfillmentType, &it.Stock, &it.IsActive); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// effective stock
	for i := range out {
		es, err := r.effectiveStock(ctx, &out[i])
		if err != nil {
			return nil, err
		}
		out[i].EffectiveStock = es
	}
	return out, nil
}

func (r *Repo) effectiveStock(ctx context.Context, it *Item) (*int, error) {
	if it.FulfillmentType == "coupon" {
		var n int
		if err := r.db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reward_coupon_codes WHERE item_id = ? AND redemption_id IS NULL`,
			it.ID).Scan(&n); err != nil {
			return nil, err
		}
		return &n, nil
	}
	return it.Stock, nil // manual: nil = unlimited
}

func (r *Repo) ItemByID(ctx context.Context, id int64) (*Item, error) {
	var it Item
	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, description, image_url, points_cost, fulfillment_type, stock, is_active
		 FROM reward_items WHERE id = ?`, id,
	).Scan(&it.ID, &it.Name, &it.Description, &it.ImageURL, &it.PointsCost, &it.FulfillmentType, &it.Stock, &it.IsActive)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &it, nil
}

// RedeemItem performs the full redemption transaction with row locks.
func (r *Repo) RedeemItem(ctx context.Context, userID int64, item *Item) (*Redemption, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if !item.IsActive {
		return nil, ErrItemInactive
	}

	// lock balance row
	var points int
	err = tx.QueryRowContext(ctx,
		`SELECT points FROM reward_balances WHERE user_id = ? FOR UPDATE`, userID).Scan(&points)
	if errors.Is(err, sql.ErrNoRows) {
		points = 0
	} else if err != nil {
		return nil, err
	}
	if points < item.PointsCost {
		return nil, ErrInsufficientPoints
	}

	// manual stock check
	if item.FulfillmentType == "manual" && item.Stock != nil && *item.Stock <= 0 {
		return nil, ErrOutOfStock
	}

	status := "pending"
	coupon := ""
	var claimedCodeID int64
	if item.FulfillmentType == "coupon" {
		err = tx.QueryRowContext(ctx,
			`SELECT id, code FROM reward_coupon_codes
			 WHERE item_id = ? AND redemption_id IS NULL
			 ORDER BY id LIMIT 1 FOR UPDATE`, item.ID).Scan(&claimedCodeID, &coupon)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrOutOfStock
		}
		if err != nil {
			return nil, err
		}
		status = "fulfilled"
	}

	// deduct: negative ledger row + balance update (upsert to be safe)
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
		 VALUES (?, 'redemption_spend', ?, 'redemption', NULL)`,
		userID, -item.PointsCost); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_balances (user_id, points, lifetime_points) VALUES (?, ?, 0)
		 ON DUPLICATE KEY UPDATE points = points + VALUES(points)`,
		userID, -item.PointsCost); err != nil {
		return nil, err
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_redemptions (user_id, item_id, item_name, points_spent, status, coupon_code, resolved_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		userID, item.ID, item.Name, item.PointsCost, status, coupon,
		sql.NullTime{Time: nowUTC(), Valid: status == "fulfilled"},
	)
	if err != nil {
		return nil, err
	}
	redemptionID, _ := res.LastInsertId()

	// update the spend ledger row ref_id + claim code + decrement manual stock
	if _, err := tx.ExecContext(ctx,
		`UPDATE reward_transactions SET ref_id = ?
		 WHERE user_id = ? AND event_type = 'redemption_spend' AND ref_id IS NULL
		 ORDER BY id DESC LIMIT 1`, redemptionID, userID); err != nil {
		return nil, err
	}
	if item.FulfillmentType == "coupon" {
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_coupon_codes SET redemption_id = ? WHERE id = ?`,
			redemptionID, claimedCodeID); err != nil {
			return nil, err
		}
	} else if item.Stock != nil {
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_items SET stock = stock - 1 WHERE id = ? AND stock > 0`, item.ID); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &Redemption{
		ID: redemptionID, UserID: userID, ItemID: &item.ID, ItemName: item.Name,
		PointsSpent: item.PointsCost, Status: status, CouponCode: coupon,
	}, nil
}

func (r *Repo) scanRedemptions(rows *sql.Rows, withEmail bool) ([]Redemption, error) {
	defer rows.Close()
	var out []Redemption
	for rows.Next() {
		var rd Redemption
		var dests = []any{&rd.ID, &rd.UserID, &rd.ItemID, &rd.ItemName, &rd.PointsSpent,
			&rd.Status, &rd.CouponCode, &rd.AdminNote, &rd.CreatedAt, &rd.ResolvedAt}
		if withEmail {
			dests = append(dests, &rd.UserEmail)
		}
		if err := rows.Scan(dests...); err != nil {
			return nil, err
		}
		out = append(out, rd)
	}
	return out, rows.Err()
}

func (r *Repo) MyRedemptions(ctx context.Context, userID int64) ([]Redemption, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id, item_id, item_name, points_spent, status, coupon_code, admin_note, created_at, resolved_at
		 FROM reward_redemptions WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	return r.scanRedemptions(rows, false)
}

func (r *Repo) AdminRedemptions(ctx context.Context, status string) ([]Redemption, error) {
	q := `SELECT rr.id, rr.user_id, rr.item_id, rr.item_name, rr.points_spent, rr.status,
	             rr.coupon_code, rr.admin_note, rr.created_at, rr.resolved_at, COALESCE(u.email,'')
	      FROM reward_redemptions rr LEFT JOIN users u ON rr.user_id = u.id`
	var args []any
	if status != "" {
		q += ` WHERE rr.status = ?`
		args = append(args, status)
	}
	q += ` ORDER BY rr.created_at DESC`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	return r.scanRedemptions(rows, true)
}

// ResolveRedemption approves or rejects a pending manual redemption.
func (r *Repo) ResolveRedemption(ctx context.Context, id int64, status, note string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var userID, pointsSpent int64
	var cur string
	err = tx.QueryRowContext(ctx,
		`SELECT user_id, points_spent, status FROM reward_redemptions WHERE id = ? FOR UPDATE`, id).
		Scan(&userID, &pointsSpent, &cur)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if cur != "pending" {
		return ErrValidation
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE reward_redemptions SET status = ?, admin_note = ?, resolved_at = ? WHERE id = ?`,
		status, note, nowUTC(), id); err != nil {
		return err
	}
	if status == "rejected" {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
			 VALUES (?, 'redemption_refund', ?, 'redemption', ?)`,
			userID, pointsSpent, id); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_balances SET points = points + ? WHERE user_id = ?`,
			pointsSpent, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}
