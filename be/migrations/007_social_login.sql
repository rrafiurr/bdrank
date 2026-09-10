-- Social login: track auth provider and allow passwordless (social-only) users.

-- MySQL has no ADD COLUMN IF NOT EXISTS (it is a MariaDB extension and is a
-- syntax error here), so guard via information_schema the same way
-- 012_anonymous_reviews.sql does: only run the ALTER TABLE when the column is
-- missing, keeping this file safe to re-run.
SET @db := DATABASE();

SET @needs := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='auth_provider');
SET @sql := IF(@needs,
    "ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'email' AFTER password_hash",
    "DO 0");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Social-only users have no password, so the column must accept NULL.
-- Re-running this statement is a no-op.
ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;
