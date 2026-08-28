-- Custom review form fields: admin-defined inputs shown on the review form,
-- scoped to a category with per-product add/hide overrides.

CREATE TABLE IF NOT EXISTS review_fields (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope       ENUM('category','product') NOT NULL,
  scope_ref   VARCHAR(100) NOT NULL,
  field_key   VARCHAR(64)  NOT NULL,
  label       VARCHAR(200) NOT NULL,
  type        ENUM('text','url','select','number') NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  options     JSON NULL,
  min_value   DECIMAL(12,2) NULL,
  max_value   DECIMAL(12,2) NULL,
  help_text   VARCHAR(300) NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scope_key (scope, scope_ref, field_key),
  INDEX idx_scope (scope, scope_ref, is_active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_field_hides (
  product_id BIGINT NOT NULL,
  field_id   BIGINT NOT NULL,
  PRIMARY KEY (product_id, field_id),
  CONSTRAINT fk_pfh_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfh_field   FOREIGN KEY (field_id)   REFERENCES review_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS review_field_values (
  id           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  review_id    BIGINT NOT NULL,
  field_id     BIGINT NOT NULL,
  value_text   VARCHAR(1000) NULL,
  value_number DECIMAL(12,2) NULL,
  CONSTRAINT fk_rfv_review FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_rfv_field  FOREIGN KEY (field_id)  REFERENCES review_fields(id) ON DELETE CASCADE,
  UNIQUE KEY uq_review_field (review_id, field_id),
  INDEX idx_field (field_id)
) ENGINE=InnoDB;
