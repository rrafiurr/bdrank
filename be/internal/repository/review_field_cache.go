package repository

import (
	"context"
	"encoding/json"
	"log"
	"strconv"

	"github.com/redis/go-redis/v9"

	"final-review/be/internal/models"
)

// The v1 in these keys is the cached response shape, not the feature version.
// Changing the shape of models.ReviewField means bumping it, so old entries are
// never read again and no flush is needed.
func CategoryKey(slug string) string { return "reviewform:v1:cat:" + slug }
func ProductKey(id int64) string     { return "reviewform:v1:prod:" + strconv.FormatInt(id, 10) }
func MembersKey(slug string) string  { return "reviewform:v1:cat:" + slug + ":members" }

// ReviewFieldCache serves resolved field lists from Redis, falling back to the
// repository. The form must load even when Redis is down, so every cache error
// degrades to a direct read rather than failing the request.
type ReviewFieldCache struct {
	repo *ReviewFieldRepo
	rdb  *redis.Client
}

func NewReviewFieldCache(repo *ReviewFieldRepo, rdb *redis.Client) *ReviewFieldCache {
	return &ReviewFieldCache{repo: repo, rdb: rdb}
}

func (c *ReviewFieldCache) Resolve(ctx context.Context, categorySlug string, productID int64) ([]models.ReviewField, error) {
	// Determine the slug once, before the repo call. A product's real
	// category always wins over a caller-supplied slug — see
	// ReviewFieldRepo.resolveCategorySlug — so the members-set registration
	// below never files a product under the wrong category.
	slug := categorySlug
	if productID != 0 {
		if s, err := c.repo.CategoryOfProduct(ctx, productID); err != nil {
			log.Printf("WARN review-field cache: CategoryOfProduct(%d): %v", productID, err)
		} else {
			slug = s
		}
	}

	key := CategoryKey(slug)
	if productID != 0 {
		key = ProductKey(productID)
	}

	if c.rdb != nil {
		if raw, err := c.rdb.Get(ctx, key).Result(); err == nil {
			var fields []models.ReviewField
			if json.Unmarshal([]byte(raw), &fields) == nil {
				return fields, nil
			}
			// Unreadable entry: fall through and rebuild rather than serve nothing.
		}
	}

	fields, err := c.repo.Resolve(ctx, slug, productID)
	if err != nil {
		return nil, err
	}

	if c.rdb != nil {
		if blob, err := json.Marshal(fields); err == nil {
			// No TTL: entries live until an admin write invalidates them.
			if err := c.rdb.Set(ctx, key, blob, 0).Err(); err != nil {
				log.Printf("WARN review-field cache set %s: %v", key, err)
			}
			// Record which products drew on this category, so a later category
			// edit can clear their keys without scanning. KEYS is not usable
			// on a production Redis.
			if productID != 0 {
				if slug != "" {
					if err := c.rdb.SAdd(ctx, MembersKey(slug), productID).Err(); err != nil {
						log.Printf("WARN review-field cache sadd %s product %d: %v", MembersKey(slug), productID, err)
					}
				} else {
					log.Printf("WARN review-field cache: product %d key cached without member registration (slug empty)", productID)
				}
			}
		}
	}
	return fields, nil
}

// InvalidateCategory clears a category's entry and every product entry that
// inherited from it. Missing the fan-out is the failure this whole members-set
// design exists to prevent: the category would refresh while its products kept
// serving the old field list.
func (c *ReviewFieldCache) InvalidateCategory(ctx context.Context, slug string) error {
	if c.rdb == nil {
		return nil
	}
	members, err := c.rdb.SMembers(ctx, MembersKey(slug)).Result()
	if err != nil && err != redis.Nil {
		return err
	}
	keys := make([]string, 0, len(members)+2)
	keys = append(keys, CategoryKey(slug), MembersKey(slug))
	for _, m := range members {
		if id, err := strconv.ParseInt(m, 10, 64); err == nil {
			keys = append(keys, ProductKey(id))
		}
	}
	return c.rdb.Del(ctx, keys...).Err()
}

// InvalidateProduct clears one product's entry. Its category is untouched:
// a product-level change cannot affect what any other product resolves to.
func (c *ReviewFieldCache) InvalidateProduct(ctx context.Context, productID int64) error {
	if c.rdb == nil {
		return nil
	}
	return c.rdb.Del(ctx, ProductKey(productID)).Err()
}
