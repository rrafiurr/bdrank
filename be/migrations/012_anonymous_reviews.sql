-- Per-review anonymity. The review keeps its user_id: anonymity is a display
-- property, so rewards, the author's own profile listing, and moderation all
-- keep working. Only the public-facing author identity is suppressed.

-- MySQL has no ADD COLUMN IF NOT EXISTS, so guard via information_schema:
-- check whether the column already exists and only run the ALTER TABLE when
-- it doesn't, so this file stays safe to re-run against a database that has
-- already had it applied.
SET @db := DATABASE();

SET @needs := (SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=@db AND TABLE_NAME='reviews' AND COLUMN_NAME='is_anonymous');
SET @sql := IF(@needs,
    "ALTER TABLE reviews ADD COLUMN is_anonymous TINYINT(1) NOT NULL DEFAULT 0",
    "DO 0");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
