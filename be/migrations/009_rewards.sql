-- Reward system: points economy, levels, redemption catalog, and admin campaigns.
-- All tables prefixed reward_. Self-contained; only FK dependency is users(id).

CREATE TABLE IF NOT EXISTS reward_rules (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    event_type    VARCHAR(64)  NOT NULL UNIQUE,
    points        INT          NOT NULL DEFAULT 0,
    daily_cap     INT          NULL,
    lifetime_cap  INT          NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO reward_rules (event_type, points, daily_cap, lifetime_cap, is_active) VALUES
    ('review_created',    10, NULL, NULL, 1),
    ('review_with_image',  5, NULL, NULL, 1),
    ('comment_created',    2, 10,   NULL, 1),
    ('daily_login',        1, 1,    NULL, 1),
    ('profile_completed',  5, NULL, 1,    1)
ON DUPLICATE KEY UPDATE event_type = event_type;

CREATE TABLE IF NOT EXISTS reward_transactions (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    event_type  VARCHAR(64)  NOT NULL,
    points      INT          NOT NULL,
    ref_type    VARCHAR(32)  NOT NULL DEFAULT '',
    ref_id      BIGINT       NULL,
    note        VARCHAR(255) NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_tx_user_event_time (user_id, event_type, created_at),
    INDEX idx_reward_tx_user_time (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_balances (
    user_id         BIGINT     PRIMARY KEY,
    points          INT        NOT NULL DEFAULT 0,
    lifetime_points INT        NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_levels (
    id         BIGINT       PRIMARY KEY AUTO_INCREMENT,
    name       VARCHAR(64)  NOT NULL,
    min_points INT          NOT NULL,
    icon       VARCHAR(64)  NOT NULL DEFAULT '',
    color      VARCHAR(16)  NOT NULL DEFAULT '',
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    INDEX idx_reward_levels_min (min_points)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_items (
    id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
    name             VARCHAR(128) NOT NULL,
    description      VARCHAR(500) NOT NULL DEFAULT '',
    image_url        VARCHAR(500) NOT NULL DEFAULT '',
    points_cost      INT          NOT NULL,
    fulfillment_type ENUM('coupon','manual') NOT NULL DEFAULT 'manual',
    stock            INT          NULL,
    is_active        TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_coupon_codes (
    id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
    item_id       BIGINT       NOT NULL,
    code          VARCHAR(128) NOT NULL,
    redemption_id BIGINT       NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_codes_item_claimed (item_id, redemption_id),
    FOREIGN KEY (item_id) REFERENCES reward_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_redemptions (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    item_id     BIGINT       NULL,
    item_name   VARCHAR(128) NOT NULL,
    points_spent INT         NOT NULL,
    status      ENUM('pending','approved','rejected','fulfilled') NOT NULL DEFAULT 'pending',
    coupon_code VARCHAR(128) NOT NULL DEFAULT '',
    admin_note  VARCHAR(500) NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP    NULL,
    INDEX idx_reward_redemptions_user (user_id, created_at),
    INDEX idx_reward_redemptions_status (status, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_campaigns (
    id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
    name        VARCHAR(128) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    image_url   VARCHAR(500) NOT NULL DEFAULT '',
    starts_at   TIMESTAMP    NOT NULL,
    ends_at     TIMESTAMP    NOT NULL,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_campaigns_window (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_campaign_goals (
    id               BIGINT       PRIMARY KEY AUTO_INCREMENT,
    campaign_id      BIGINT       NOT NULL,
    name             VARCHAR(128) NOT NULL,
    threshold_points INT          NOT NULL,
    sort_order       INT          NOT NULL DEFAULT 0,
    reward_points    INT          NOT NULL DEFAULT 0,
    reward_item_id   BIGINT       NULL,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reward_goals_campaign (campaign_id, sort_order),
    FOREIGN KEY (campaign_id) REFERENCES reward_campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reward_campaign_progress (
    id               BIGINT     PRIMARY KEY AUTO_INCREMENT,
    campaign_id      BIGINT     NOT NULL,
    user_id          BIGINT     NOT NULL,
    redeemed_goal_id BIGINT     NULL,
    status           ENUM('active','redeemed','expired') NOT NULL DEFAULT 'active',
    redeemed_at      TIMESTAMP  NULL,
    updated_at       TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_reward_progress (campaign_id, user_id),
    FOREIGN KEY (campaign_id) REFERENCES reward_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
