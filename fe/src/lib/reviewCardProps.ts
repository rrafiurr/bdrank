import type { ApiReviewListItem } from "@/lib/api";

/**
 * Map a review from the API onto ReviewCard's props.
 *
 * Shared by every page that renders review cards so the listings cannot drift
 * apart — an imported review must be credited the same way everywhere it
 * appears.
 */
export function toCardProps(r: ApiReviewListItem, locale: string) {
  return {
    id: String(r.id),
    title: r.title,
    excerpt: r.excerpt,
    author: r.author?.username ?? "",
    authorAvatar: r.author?.avatar_url ?? "",
    authorBadge: r.author_badge,
    isAnonymous: r.is_anonymous,
    source: r.source,
    sourceAuthor: r.source_author,
    rating: r.rating,
    category: r.category,
    productName: r.product.name,
    images: r.images ?? [],
    commentsCount: r.comments_count,
    likesCount: r.likes_count,
    isTimeline: r.is_timeline,
    timelineUpdates: r.timeline_updates_count,
    createdAt: new Date(r.created_at).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  };
}
