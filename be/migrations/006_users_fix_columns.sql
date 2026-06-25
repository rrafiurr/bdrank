-- Ensure created_at always has a value (was nullable on some deployments)
ALTER TABLE users
  MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add is_admin column if it was missing from migration history
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar_url;
