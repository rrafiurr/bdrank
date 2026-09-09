-- Per-product control over the home page product carousel.
--   auto   — normal ordering (the default; existing behaviour)
--   pinned — always shown, sorted to the front, even with no reviews
--   hidden — never shown on the home page (still searchable and browsable)
ALTER TABLE products
  ADD COLUMN home_placement ENUM('auto','pinned','hidden') NOT NULL DEFAULT 'auto';
