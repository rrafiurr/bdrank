-- Add columns that are referenced in code but were missing from earlier migrations.
-- Uses IF NOT EXISTS so this is safe to run on a DB that already has some columns.

-- reviews: approval flag and timeline flag
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS is_approved  TINYINT(1) NOT NULL DEFAULT 0 AFTER rating,
  ADD COLUMN IF NOT EXISTS is_timeline  TINYINT(1) NOT NULL DEFAULT 0 AFTER is_approved;

-- users: product-owner fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_product_owner TINYINT(1)   NOT NULL DEFAULT 0 AFTER bio,
  ADD COLUMN IF NOT EXISTS owner_verified   TINYINT(1)   NOT NULL DEFAULT 0 AFTER is_product_owner,
  ADD COLUMN IF NOT EXISTS company_name     VARCHAR(255) NULL     DEFAULT NULL AFTER owner_verified;

-- comments: approval flag
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS is_approved TINYINT(1) NOT NULL DEFAULT 1 AFTER content;

-- products: link to the owner user
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS owner_id BIGINT NULL DEFAULT NULL AFTER image_url;

-- FK for owner_id (only add if it doesn't already exist)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND CONSTRAINT_NAME = 'fk_product_owner'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE products ADD CONSTRAINT fk_product_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Approve seed reviews so they appear publicly
UPDATE reviews SET is_approved = 1
WHERE is_approved = 0
  AND user_id IN (
    SELECT id FROM users
    WHERE email IN ('alice@example.com','bob@example.com','carol@example.com','dave@example.com','eva@example.com')
  );
