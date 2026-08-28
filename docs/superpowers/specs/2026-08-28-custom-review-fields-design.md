# Custom Review Form Fields — Design

**Date:** 2026-08-28
**Status:** Draft, awaiting review

## Summary

The review form is fixed: product, title, category, rating, content, images,
anonymous. Some kinds of business need more. An f-commerce seller has no
website to point at, so a reviewer should be asked for the Facebook page link;
a resort review might want the room type.

Admins define extra fields per category. A product can add fields of its own
and hide ones it inherits. The reviewer sees one merged list. Answers are
stored per review and displayed on the review; nothing filters or aggregates on
them yet.

The resolved field list is cached in Redis and invalidated when an admin edits
a field.

## Decisions

| Question | Decision |
|---|---|
| What a field attaches to | Category, with per-product overrides. The motivating case ("page link" for f-commerce) is a property of the category, not of one shop, but a single product sometimes differs. |
| How overrides merge | A product may **add** fields and **hide** inherited ones. It may not modify an inherited field's label, type, or requiredness — that turns every field into a partial-merge problem and forces the admin UI to explain provenance. |
| Field types in v1 | `text`, `url`, `select`, `number`. |
| What happens to answers | Displayed on the review detail page and in the CMS. No filtering, no aggregation. |
| Cache invalidation | Explicit delete on admin write. No TTL backstop (see Accepted risk). |
| Deleting a field | Soft delete (`is_active = 0`). Hard-deleting a definition would destroy the answers on every historical review that used it. |

### Accepted risk: invalidation without a TTL

Cached config is removed only by an explicit delete in an admin write path. If a
write path is added later and forgets to invalidate, its category serves stale
config until Redis is restarted or the key is deleted by hand — there is no
expiry to heal it.

A TTL backstop was rejected in favour of edits appearing instantly. The
mitigation is that invalidation lives in one place (`ReviewFieldCache.Invalidate`)
which every admin write calls, and is covered by tests asserting that a category
edit clears the keys of products inheriting from it.

## Architecture: resolution in the repository, cache in front

```
fields(product) = category fields
                − product_field_hides
                + product's own fields
                sorted by sort_order, then id
```

Resolution lives in `ReviewFieldRepo.Resolve(categorySlug, productID)`, not in a
handler, so the reviewer form, the submit validator, and the CMS preview all
compute the same list from one implementation. A validator that resolved fields
differently from the form would reject answers the reviewer was legitimately
asked for.

A product that does not exist yet — the reviewer typed a new name into the
autocomplete — resolves to its category's fields alone. There is no product row
to carry overrides.

## Data model

Migration `013_custom_review_fields.sql`. (Note: `011` is absent from the
migration sequence already; this continues from `012`.)

```sql
CREATE TABLE review_fields (
  id          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope       ENUM('category','product') NOT NULL,
  scope_ref   VARCHAR(100) NOT NULL,          -- category slug, or product id as text
  field_key   VARCHAR(64)  NOT NULL,          -- machine name, e.g. 'page_link'
  label       VARCHAR(200) NOT NULL,
  type        ENUM('text','url','select','number') NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  options     JSON NULL,                      -- select only: ["Facebook","WhatsApp"]
  min_value   DECIMAL(12,2) NULL,             -- number only
  max_value   DECIMAL(12,2) NULL,
  help_text   VARCHAR(300) NOT NULL DEFAULT '',
  sort_order  INT NOT NULL DEFAULT 0,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scope_key (scope, scope_ref, field_key),
  INDEX idx_scope (scope, scope_ref, is_active)
) ENGINE=InnoDB;

CREATE TABLE product_field_hides (
  product_id BIGINT NOT NULL,
  field_id   BIGINT NOT NULL,
  PRIMARY KEY (product_id, field_id),
  CONSTRAINT fk_pfh_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfh_field   FOREIGN KEY (field_id)   REFERENCES review_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE review_field_values (
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
```

`scope_ref` is a string for both scopes rather than two nullable columns, so the
unique key and the lookup index work uniformly. Product ids are stored as their
decimal text.

`value_number` is populated for `number` fields in addition to `value_text`.
Nothing reads it yet. It exists so that adding filtering or aggregation later is
a feature, not a data migration over every historical answer.

`ON DELETE CASCADE` on `review_field_values.field_id` is deliberate and is why
field deletion is soft: a hard delete of a definition would take its answers
with it.

## API

### Public

```
GET /api/v1/review-fields?category=<slug>
GET /api/v1/review-fields?product_id=<id>
```

Returns the resolved, ordered field list. `product_id` wins when both are given.
Served from cache.

```json
[{ "id": 4, "field_key": "page_link", "label": "Facebook page link",
   "type": "url", "is_required": true, "help_text": "", "options": null,
   "min_value": null, "max_value": null }]
```

### Submission

`POST /api/v1/reviews` is multipart today (it carries images). Answers arrive as
a `fields` part holding a JSON object keyed by field id:

```
fields = {"4": "https://facebook.com/someshop", "7": "3"}
```

The handler re-resolves the field list server-side and validates against it. It
does not trust the submitted key set: a client may omit, add, or alter keys.

| Rule | Response |
|---|---|
| Required field missing or blank | 400, naming the field |
| Key not in the resolved set | Ignored, not an error — a stale form open during an admin edit must not fail on submit |
| `url` not parseable as http/https | 400 |
| `number` not numeric, or outside min/max | 400 |
| `select` value not among `options` | 400 |
| `text` longer than 1000 chars | 400 |

### Read

`GET /api/v1/reviews/{id}` gains `custom_fields`, ordered as displayed:

```json
"custom_fields": [{ "label": "Facebook page link", "type": "url",
                    "value": "https://facebook.com/someshop" }]
```

Definitions are joined by id, so an answer to a since-deactivated field still
renders with its original label. Omitted entirely when the review has none, so
every existing review is unaffected.

### Admin

```
GET    /api/v1/admin/review-fields?scope=category&scope_ref=fcommerce
POST   /api/v1/admin/review-fields
PATCH  /api/v1/admin/review-fields/{id}
DELETE /api/v1/admin/review-fields/{id}          -- soft: sets is_active = 0
POST   /api/v1/admin/products/{id}/field-hides   -- { field_id, hidden: bool }
```

## Caching

`ReviewFieldCache` wraps the repository.

| | |
|---|---|
| Keys | `reviewform:v1:cat:<slug>`, `reviewform:v1:prod:<id>` |
| Value | the resolved list as JSON |
| Members set | `reviewform:v1:cat:<slug>:members` — product ids whose resolved list drew on this category |

The version prefix (`v1`) lets the response shape change without a flush: bump
it and every old key is simply never read again.

**Invalidation.** A write to a category field deletes that category's key *and*
every product key in its members set. A write to a product field or a hide
deletes only that product's key. This fan-out is the part most likely to be got
wrong, and is why the members set exists rather than scanning keys — `KEYS` on a
production Redis is not acceptable.

Redis being unavailable must degrade to a direct repository read, never a failed
form load. The form is more important than the cache.

## Frontend

`ReviewForm.tsx` renders resolved fields between Rating and Content.

The form already locks Category when an existing product is selected and frees
it when creating a new one. Custom fields follow the same signal: fetch by
`product_id` when a product is selected, by `category` otherwise.

**Answers survive a re-fetch.** Switching product or category re-resolves the
list; answers to fields that are still present are kept, answers to fields that
are gone are dropped. Clearing everything on each change would discard typing
whenever someone corrects their product selection late.

Required custom fields join the existing submit validation and block with the
same styling.

## CMS

A **Form Fields** page: choose a category, see its fields, add / edit / reorder /
deactivate. Reordering writes `sort_order`.

Product overrides live on the existing product edit screen: inherited fields
listed with a hide toggle, plus the product's own fields.

Reusing `ReviewForm`'s renderer for a live preview is explicitly **not**
proposed — it would couple the public form to the CMS build.

## Testing

- `Resolve` merge: inheritance, addition, hiding, ordering, a product with no
  overrides, a category with no fields
- Submit validation: each rule in the table above, plus the ignored-unknown-key
  case
- Cache: hit and miss; a category edit clears inheriting product keys; a product
  edit does not clear its category's key; Redis down falls back to the repository
- Soft delete: a deactivated field disappears from the form and still renders on
  reviews that answered it

## Out of scope

Filtering or sorting by answers. Aggregation on the product page. Conditional
fields. File-upload field type. Per-field visibility rules. Editing answers after
submission. Field definitions on the product *type* rather than the category.

All are additive on this schema.

## Open question for review

The `select` type stores the chosen label as text. If an admin later renames an
option, historical answers keep the old label. Storing an option id instead would
let renames propagate, at the cost of a fourth table. Recommendation: keep text —
a review is a record of what someone answered at the time.
