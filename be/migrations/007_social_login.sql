-- Social login: track auth provider and allow passwordless (social-only) users.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'email' AFTER password_hash;

ALTER TABLE users
  MODIFY password_hash VARCHAR(255) NULL;
