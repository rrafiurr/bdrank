-- Indexes supporting the rewards leaderboard.
-- Windowed boards scan reward_transactions by created_at then group by user;
-- the existing idx_reward_tx_user_time leads with user_id and does not serve it.
CREATE INDEX idx_reward_tx_time_user_points
    ON reward_transactions (created_at, user_id, points);

-- All-time board orders reward_balances by lifetime_points.
CREATE INDEX idx_reward_balances_lifetime
    ON reward_balances (lifetime_points);
