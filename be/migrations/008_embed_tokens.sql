CREATE TABLE IF NOT EXISTS embed_tokens (
    id             BIGINT       PRIMARY KEY AUTO_INCREMENT,
    token          VARCHAR(64)  NOT NULL UNIQUE,
    product_id     BIGINT       NOT NULL,
    owner_id       BIGINT       NOT NULL,
    domain         VARCHAR(255) NOT NULL,
    status         ENUM('pending','approved','revoked') NOT NULL DEFAULT 'pending',
    show_rating    TINYINT(1)   NOT NULL DEFAULT 1,
    show_count     TINYINT(1)   NOT NULL DEFAULT 1,
    show_breakdown TINYINT(1)   NOT NULL DEFAULT 0,
    show_snippet   TINYINT(1)   NOT NULL DEFAULT 0,
    admin_note     VARCHAR(500) NOT NULL DEFAULT '',
    created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at    TIMESTAMP    NULL DEFAULT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id)   REFERENCES users(id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
