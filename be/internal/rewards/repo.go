package rewards

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
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

// AwardAtomic performs the cap check and ledger insert in a single
// transaction, serialized per-user by locking the user's reward_balances
// row. This prevents concurrent events from all reading the count as
// under-cap and all committing, which would exceed the cap.
func (r *Repo) AwardAtomic(ctx context.Context, userID int64, rule *Rule, refType string, refID int64) (bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	// ensure the balance row exists so the lock below actually locks,
	// even for brand-new users who have never been awarded points.
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_balances (user_id, points, lifetime_points) VALUES (?, 0, 0)
		 ON DUPLICATE KEY UPDATE user_id = user_id`,
		userID); err != nil {
		return false, err
	}
	// lock the balance row; serializes all awards for this user.
	var points int
	if err := tx.QueryRowContext(ctx,
		`SELECT points FROM reward_balances WHERE user_id = ? FOR UPDATE`, userID).Scan(&points); err != nil {
		return false, err
	}

	if rule.DailyCap != nil {
		var today int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reward_transactions
			 WHERE user_id = ? AND event_type = ? AND created_at >= UTC_DATE()`,
			userID, rule.EventType).Scan(&today); err != nil {
			return false, err
		}
		if CapReached(Rule{DailyCap: rule.DailyCap}, today, 0) {
			return false, tx.Commit()
		}
	}
	if rule.LifetimeCap != nil {
		var life int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM reward_transactions WHERE user_id = ? AND event_type = ?`,
			userID, rule.EventType).Scan(&life); err != nil {
			return false, err
		}
		if CapReached(Rule{LifetimeCap: rule.LifetimeCap}, 0, life) {
			return false, tx.Commit()
		}
	}

	var refIDArg any
	if refID != 0 {
		refIDArg = refID
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, rule.EventType, rule.Points, refType, refIDArg,
	); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx,
		`UPDATE reward_balances SET points = points + ?, lifetime_points = lifetime_points + ? WHERE user_id = ?`,
		rule.Points, rule.Points, userID,
	); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
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
		res, err := tx.ExecContext(ctx,
			`UPDATE reward_items SET stock = stock - 1 WHERE id = ? AND stock > 0`, item.ID)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, ErrOutOfStock
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

// ── campaigns ───────────────────────────────────────────────────────────
func (r *Repo) scanCampaigns(rows *sql.Rows) ([]Campaign, error) {
	defer rows.Close()
	var out []Campaign
	for rows.Next() {
		var c Campaign
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.ImageURL,
			&c.StartsAt, &c.EndsAt, &c.IsActive, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repo) goalsFor(ctx context.Context, campaignID int64) ([]CampaignGoal, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, campaign_id, name, threshold_points, sort_order, reward_points, reward_item_id
		 FROM reward_campaign_goals WHERE campaign_id = ? ORDER BY sort_order ASC, threshold_points ASC`,
		campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CampaignGoal
	for rows.Next() {
		var g CampaignGoal
		if err := rows.Scan(&g.ID, &g.CampaignID, &g.Name, &g.ThresholdPoints, &g.SortOrder,
			&g.RewardPoints, &g.RewardItemID); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *Repo) ActiveCampaigns(ctx context.Context, now time.Time) ([]Campaign, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns WHERE is_active = 1 AND starts_at <= ? AND ends_at >= ?
		 ORDER BY ends_at ASC`, now, now)
	if err != nil {
		return nil, err
	}
	camps, err := r.scanCampaigns(rows)
	if err != nil {
		return nil, err
	}
	for i := range camps {
		g, err := r.goalsFor(ctx, camps[i].ID)
		if err != nil {
			return nil, err
		}
		camps[i].Goals = g
	}
	return camps, nil
}

func (r *Repo) EndedCampaignsSince(ctx context.Context, since, now time.Time) ([]Campaign, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns WHERE is_active = 1 AND ends_at < ? AND ends_at >= ?
		 ORDER BY ends_at DESC`, now, since)
	if err != nil {
		return nil, err
	}
	camps, err := r.scanCampaigns(rows)
	if err != nil {
		return nil, err
	}
	for i := range camps {
		g, err := r.goalsFor(ctx, camps[i].ID)
		if err != nil {
			return nil, err
		}
		camps[i].Goals = g
	}
	return camps, nil
}

func (r *Repo) AllCampaigns(ctx context.Context) ([]Campaign, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	camps, err := r.scanCampaigns(rows)
	if err != nil {
		return nil, err
	}
	for i := range camps {
		g, err := r.goalsFor(ctx, camps[i].ID)
		if err != nil {
			return nil, err
		}
		camps[i].Goals = g
	}
	return camps, nil
}

func (r *Repo) CampaignByID(ctx context.Context, id int64) (*Campaign, error) {
	var c Campaign
	err := r.db.QueryRowContext(ctx,
		`SELECT id, name, description, image_url, starts_at, ends_at, is_active, created_at
		 FROM reward_campaigns WHERE id = ?`, id).
		Scan(&c.ID, &c.Name, &c.Description, &c.ImageURL, &c.StartsAt, &c.EndsAt, &c.IsActive, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	g, err := r.goalsFor(ctx, id)
	if err != nil {
		return nil, err
	}
	c.Goals = g
	return &c, nil
}

func (r *Repo) WindowPoints(ctx context.Context, userID int64, start, end time.Time) (int, error) {
	var sum sql.NullInt64
	err := r.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(points),0) FROM reward_transactions
		 WHERE user_id = ? AND points > 0 AND created_at BETWEEN ? AND ?
		   AND event_type NOT IN ('redemption_spend','redemption_refund','campaign_reward')`,
		userID, start, end).Scan(&sum)
	return int(sum.Int64), err
}

func (r *Repo) Progress(ctx context.Context, campaignID, userID int64) (*CampaignProgress, error) {
	var pr CampaignProgress
	err := r.db.QueryRowContext(ctx,
		`SELECT campaign_id, user_id, redeemed_goal_id, status, redeemed_at
		 FROM reward_campaign_progress WHERE campaign_id = ? AND user_id = ?`, campaignID, userID).
		Scan(&pr.CampaignID, &pr.UserID, &pr.RedeemedGoalID, &pr.Status, &pr.RedeemedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &pr, nil
}

// GrantCampaignGoal marks progress redeemed and grants the goal's reward.
func (r *Repo) GrantCampaignGoal(ctx context.Context, userID int64, camp *Campaign, goal *CampaignGoal) (*Redemption, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// idempotency guard: lock/insert progress; fail if already redeemed
	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_campaign_progress (campaign_id, user_id, redeemed_goal_id, status, redeemed_at)
		 VALUES (?, ?, ?, 'redeemed', ?)
		 ON DUPLICATE KEY UPDATE
		   redeemed_goal_id = IF(status = 'redeemed', redeemed_goal_id, VALUES(redeemed_goal_id)),
		   status = IF(status = 'redeemed', status, 'redeemed'),
		   redeemed_at = IF(status = 'redeemed', redeemed_at, VALUES(redeemed_at))`,
		camp.ID, userID, goal.ID, nowUTC())
	if err != nil {
		return nil, err
	}
	// RowsAffected: 1 = inserted, 2 = updated, 0 = no-op (already redeemed same values)
	if aff, _ := res.RowsAffected(); aff == 0 {
		return nil, ErrAlreadyRedeemed
	}
	// re-read to confirm we own the redemption (guards against concurrent redeem)
	var status string
	var redeemedGoal sql.NullInt64
	if err := tx.QueryRowContext(ctx,
		`SELECT status, redeemed_goal_id FROM reward_campaign_progress
		 WHERE campaign_id = ? AND user_id = ? FOR UPDATE`, camp.ID, userID).
		Scan(&status, &redeemedGoal); err != nil {
		return nil, err
	}
	if !redeemedGoal.Valid || redeemedGoal.Int64 != goal.ID {
		return nil, ErrAlreadyRedeemed
	}

	// credit reward points
	if goal.RewardPoints > 0 {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO reward_transactions (user_id, event_type, points, ref_type, ref_id, note)
			 VALUES (?, 'campaign_reward', ?, 'campaign', ?, ?)`,
			userID, goal.RewardPoints, camp.ID, camp.Name); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO reward_balances (user_id, points, lifetime_points) VALUES (?, ?, ?)
			 ON DUPLICATE KEY UPDATE points = points + VALUES(points),
			                         lifetime_points = lifetime_points + VALUES(lifetime_points)`,
			userID, goal.RewardPoints, goal.RewardPoints); err != nil {
			return nil, err
		}
	}

	var itemRedemption *Redemption
	if goal.RewardItemID != nil {
		ir, err := r.grantItemTx(ctx, tx, userID, *goal.RewardItemID)
		if err != nil {
			return nil, err
		}
		itemRedemption = ir
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return itemRedemption, nil
}

// grantItemTx grants a catalog item as a campaign reward (no points deducted).
func (r *Repo) grantItemTx(ctx context.Context, tx *sql.Tx, userID, itemID int64) (*Redemption, error) {
	var it Item
	err := tx.QueryRowContext(ctx,
		`SELECT id, name, fulfillment_type, stock, is_active FROM reward_items WHERE id = ?`, itemID).
		Scan(&it.ID, &it.Name, &it.FulfillmentType, &it.Stock, &it.IsActive)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil // item deleted → skip silently
	}
	if err != nil {
		return nil, err
	}
	status, coupon := "pending", ""
	var codeID int64
	if it.FulfillmentType == "coupon" {
		err = tx.QueryRowContext(ctx,
			`SELECT id, code FROM reward_coupon_codes WHERE item_id = ? AND redemption_id IS NULL
			 ORDER BY id LIMIT 1 FOR UPDATE`, it.ID).Scan(&codeID, &coupon)
		if errors.Is(err, sql.ErrNoRows) {
			status = "pending" // no codes left → fall back to manual pending
		} else if err != nil {
			return nil, err
		} else {
			status = "fulfilled"
		}
	}
	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_redemptions (user_id, item_id, item_name, points_spent, status, coupon_code, resolved_at)
		 VALUES (?, ?, ?, 0, ?, ?, ?)`,
		userID, it.ID, it.Name, status, coupon,
		sql.NullTime{Time: nowUTC(), Valid: status == "fulfilled"})
	if err != nil {
		return nil, err
	}
	rid, _ := res.LastInsertId()
	if status == "fulfilled" && codeID != 0 {
		if _, err := tx.ExecContext(ctx,
			`UPDATE reward_coupon_codes SET redemption_id = ? WHERE id = ?`, rid, codeID); err != nil {
			return nil, err
		}
	}
	return &Redemption{ID: rid, UserID: userID, ItemID: &it.ID, ItemName: it.Name,
		Status: status, CouponCode: coupon}, nil
}

func (r *Repo) CreateCampaign(ctx context.Context, c *Campaign) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_campaigns (name, description, image_url, starts_at, ends_at, is_active)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		c.Name, c.Description, c.ImageURL, c.StartsAt, c.EndsAt, c.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateCampaign(ctx context.Context, c *Campaign) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_campaigns SET name=?, description=?, image_url=?, starts_at=?, ends_at=?, is_active=? WHERE id=?`,
		c.Name, c.Description, c.ImageURL, c.StartsAt, c.EndsAt, c.IsActive, c.ID)
	return err
}

func (r *Repo) DeleteCampaign(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_campaigns WHERE id = ?`, id)
	return err
}

func (r *Repo) CreateGoal(ctx context.Context, g *CampaignGoal) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_campaign_goals (campaign_id, name, threshold_points, sort_order, reward_points, reward_item_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		g.CampaignID, g.Name, g.ThresholdPoints, g.SortOrder, g.RewardPoints, g.RewardItemID)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateGoal(ctx context.Context, g *CampaignGoal) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_campaign_goals SET name=?, threshold_points=?, sort_order=?, reward_points=?, reward_item_id=? WHERE id=?`,
		g.Name, g.ThresholdPoints, g.SortOrder, g.RewardPoints, g.RewardItemID, g.ID)
	return err
}

// goalsForTx loads a campaign's goals within an existing transaction,
// mirroring goalsFor's query and ordering (sort_order, then threshold_points).
func goalsForTx(ctx context.Context, tx *sql.Tx, campaignID int64) ([]CampaignGoal, error) {
	rows, err := tx.QueryContext(ctx,
		`SELECT id, campaign_id, name, threshold_points, sort_order, reward_points, reward_item_id
		 FROM reward_campaign_goals WHERE campaign_id = ? ORDER BY sort_order ASC, threshold_points ASC`,
		campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CampaignGoal
	for rows.Next() {
		var g CampaignGoal
		if err := rows.Scan(&g.ID, &g.CampaignID, &g.Name, &g.ThresholdPoints, &g.SortOrder,
			&g.RewardPoints, &g.RewardItemID); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// validateGoalOrder checks that goals, ordered by sort_order (ties broken by
// threshold_points, matching goalsFor's ORDER BY), have strictly ascending
// threshold_points. It sorts goals in place and returns ErrGoalOrder if the
// ordering is violated.
func validateGoalOrder(goals []CampaignGoal) error {
	sort.SliceStable(goals, func(i, j int) bool {
		if goals[i].SortOrder != goals[j].SortOrder {
			return goals[i].SortOrder < goals[j].SortOrder
		}
		return goals[i].ThresholdPoints < goals[j].ThresholdPoints
	})
	for i := 1; i < len(goals); i++ {
		if goals[i].ThresholdPoints <= goals[i-1].ThresholdPoints {
			return ErrGoalOrder
		}
	}
	return nil
}

// CreateGoalOrdered inserts a new campaign goal. It locks the campaign row
// for the duration of the read-validate-write so that two concurrent admin
// edits on the same campaign can't both pass the strictly-ascending
// threshold_points check and persist an out-of-order goal set (TOCTOU).
func (r *Repo) CreateGoalOrdered(ctx context.Context, g *CampaignGoal) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var campID int64
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM reward_campaigns WHERE id = ? FOR UPDATE`, g.CampaignID).Scan(&campID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}

	existing, err := goalsForTx(ctx, tx, g.CampaignID)
	if err != nil {
		return 0, err
	}
	resulting := append(existing, *g)
	if err := validateGoalOrder(resulting); err != nil {
		return 0, err
	}

	res, err := tx.ExecContext(ctx,
		`INSERT INTO reward_campaign_goals (campaign_id, name, threshold_points, sort_order, reward_points, reward_item_id)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		g.CampaignID, g.Name, g.ThresholdPoints, g.SortOrder, g.RewardPoints, g.RewardItemID)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

// UpdateGoalOrdered updates an existing campaign goal under the same
// per-campaign lock and resulting-set ordering check as CreateGoalOrdered.
func (r *Repo) UpdateGoalOrdered(ctx context.Context, g *CampaignGoal) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var campID int64
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM reward_campaigns WHERE id = ? FOR UPDATE`, g.CampaignID).Scan(&campID)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	existing, err := goalsForTx(ctx, tx, g.CampaignID)
	if err != nil {
		return err
	}
	resulting := make([]CampaignGoal, 0, len(existing)+1)
	replaced := false
	for _, eg := range existing {
		if eg.ID == g.ID {
			resulting = append(resulting, *g)
			replaced = true
		} else {
			resulting = append(resulting, eg)
		}
	}
	if !replaced {
		resulting = append(resulting, *g)
	}
	if err := validateGoalOrder(resulting); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE reward_campaign_goals SET name=?, threshold_points=?, sort_order=?, reward_points=?, reward_item_id=? WHERE id=?`,
		g.Name, g.ThresholdPoints, g.SortOrder, g.RewardPoints, g.RewardItemID, g.ID); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repo) DeleteGoal(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_campaign_goals WHERE id = ?`, id)
	return err
}

type Participant struct {
	CampaignProgress
	Email string `json:"email"`
}

func (r *Repo) CampaignParticipants(ctx context.Context, campaignID int64) ([]Participant, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT p.campaign_id, p.user_id, p.redeemed_goal_id, p.status, p.redeemed_at, COALESCE(u.email,'')
		 FROM reward_campaign_progress p LEFT JOIN users u ON p.user_id = u.id
		 WHERE p.campaign_id = ? ORDER BY p.updated_at DESC`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Participant
	for rows.Next() {
		var pt Participant
		if err := rows.Scan(&pt.CampaignID, &pt.UserID, &pt.RedeemedGoalID, &pt.Status, &pt.RedeemedAt, &pt.Email); err != nil {
			return nil, err
		}
		out = append(out, pt)
	}
	return out, rows.Err()
}

// ── admin CRUD ───────────────────────────────────────────────────────────

func (r *Repo) AllRules(ctx context.Context) ([]Rule, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, event_type, points, daily_cap, lifetime_cap, is_active, updated_at
		 FROM reward_rules ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Rule
	for rows.Next() {
		var ru Rule
		if err := rows.Scan(&ru.ID, &ru.EventType, &ru.Points, &ru.DailyCap, &ru.LifetimeCap, &ru.IsActive, &ru.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, ru)
	}
	return out, rows.Err()
}

func (r *Repo) CreateRule(ctx context.Context, ru *Rule) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_rules (event_type, points, daily_cap, lifetime_cap, is_active) VALUES (?, ?, ?, ?, ?)`,
		ru.EventType, ru.Points, ru.DailyCap, ru.LifetimeCap, ru.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateRule(ctx context.Context, ru *Rule) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_rules SET points=?, daily_cap=?, lifetime_cap=?, is_active=? WHERE id=?`,
		ru.Points, ru.DailyCap, ru.LifetimeCap, ru.IsActive, ru.ID)
	return err
}

func (r *Repo) CreateLevel(ctx context.Context, l *Level) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_levels (name, min_points, icon, color, is_active) VALUES (?, ?, ?, ?, ?)`,
		l.Name, l.MinPoints, l.Icon, l.Color, l.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateLevel(ctx context.Context, l *Level) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_levels SET name=?, min_points=?, icon=?, color=?, is_active=? WHERE id=?`,
		l.Name, l.MinPoints, l.Icon, l.Color, l.IsActive, l.ID)
	return err
}

func (r *Repo) DeleteLevel(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_levels WHERE id = ?`, id)
	return err
}

func (r *Repo) CreateItem(ctx context.Context, it *Item) (int64, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO reward_items (name, description, image_url, points_cost, fulfillment_type, stock, is_active)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		it.Name, it.Description, it.ImageURL, it.PointsCost, it.FulfillmentType, it.Stock, it.IsActive)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *Repo) UpdateItem(ctx context.Context, it *Item) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE reward_items SET name=?, description=?, image_url=?, points_cost=?, fulfillment_type=?, stock=?, is_active=? WHERE id=?`,
		it.Name, it.Description, it.ImageURL, it.PointsCost, it.FulfillmentType, it.Stock, it.IsActive, it.ID)
	return err
}

func (r *Repo) DeleteItem(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM reward_items WHERE id = ?`, id)
	return err
}

func (r *Repo) AddCouponCodes(ctx context.Context, itemID int64, codes []string) (int, error) {
	n := 0
	for _, code := range codes {
		if code == "" {
			continue
		}
		if _, err := r.db.ExecContext(ctx,
			`INSERT INTO reward_coupon_codes (item_id, code) VALUES (?, ?)`, itemID, code); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

// LevelsForUsers returns each user's current level (from lifetime_points).
// Users with no balance row or below the lowest level are absent from the map.
func (r *Repo) LevelsForUsers(ctx context.Context, userIDs []int64) (map[int64]Level, error) {
	out := map[int64]Level{}
	if len(userIDs) == 0 {
		return out, nil
	}
	levels, err := r.ListActiveLevels(ctx)
	if err != nil || len(levels) == 0 {
		return out, err
	}
	// build IN clause
	placeholders := make([]string, len(userIDs))
	args := make([]any, len(userIDs))
	for i, id := range userIDs {
		placeholders[i] = "?"
		args[i] = id
	}
	q := `SELECT user_id, lifetime_points FROM reward_balances WHERE user_id IN (` +
		strings.Join(placeholders, ",") + `)`
	rows, err := r.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var uid int64
		var lifetime int
		if err := rows.Scan(&uid, &lifetime); err != nil {
			return nil, err
		}
		if l := LevelFor(levels, lifetime); l != nil {
			out[uid] = *l
		}
	}
	return out, rows.Err()
}
