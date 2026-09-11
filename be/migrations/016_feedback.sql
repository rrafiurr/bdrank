-- User feedback about the platform: a type and a message from a logged-in
-- user, triaged by admins in the CMS, with one optional admin reply that the
-- user sees on their profile.
--
-- message_hash is the SHA-256 fingerprint used by the duplicate check (see
-- be/internal/feedback). reply_unread drives the "new reply" dot in the
-- header. Status 'spam' is shown to the user as "closed".
CREATE TABLE IF NOT EXISTS feedback (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  type         ENUM('bug','idea','complaint','praise','other') NOT NULL,
  message      TEXT NOT NULL,
  message_hash CHAR(64) NOT NULL,
  page_path    VARCHAR(300) NULL,
  user_agent   VARCHAR(255) NULL,
  status       ENUM('new','in_progress','resolved','spam') NOT NULL DEFAULT 'new',
  admin_reply  TEXT NULL,
  replied_at   TIMESTAMP NULL,
  reply_unread TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_feedback_user (user_id, created_at),
  INDEX idx_feedback_status (status, created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
