-- Optional video link on a review and on each timeline update.
--
-- Stores the URL the user submitted, not the derived embed URL: the embed
-- mapping for a platform can change (or a platform can be dropped) without a
-- data migration. internal/video re-derives the player URL on read.

ALTER TABLE reviews
  ADD COLUMN video_url VARCHAR(500) NOT NULL DEFAULT '';

ALTER TABLE timeline_entries
  ADD COLUMN video_url VARCHAR(500) NOT NULL DEFAULT '';
