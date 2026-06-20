-- Add source tracking columns to reviews
ALTER TABLE reviews
  ADD COLUMN source        VARCHAR(50)   NULL DEFAULT NULL AFTER is_approved,
  ADD COLUMN source_author VARCHAR(200)  NULL DEFAULT NULL AFTER source,
  ADD COLUMN source_url    VARCHAR(500)  NULL DEFAULT NULL AFTER source_author,
  ADD COLUMN external_id   VARCHAR(200)  NULL DEFAULT NULL AFTER source_url,
  ADD UNIQUE KEY uq_external_id (source, external_id);

-- System bot user for external imports (password_hash is a sentinel — never usable for login)
INSERT IGNORE INTO users (email, password_hash, full_name, username)
VALUES ('import-bot@system.internal', '__SYSTEM_BOT__', 'Import Bot', 'import-bot');
