import type { TFunction } from "i18next";

/**
 * Sources are stored lowercase on the review ("google"); show them the way
 * people write them. Shared so every surface labels an import identically.
 */
export function sourceLabel(source: string) {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/** The parts of a review that decide whose name goes on it. */
type AttributableReview = {
  is_anonymous: boolean;
  source?: string;
  source_author?: string;
  author?: { username: string } | null;
};

/**
 * Whose name to show on a review.
 *
 * Imported reviews are owned by the import-bot account, so `author` is the bot
 * and `source_author` holds the real name — crediting the bot would put our
 * account's name on someone else's writing. Anonymity still wins over both.
 */
export function reviewAuthorName(review: AttributableReview, t: TFunction) {
  if (review.is_anonymous) return t("review.anonymous");
  if (review.source) return review.source_author ?? review.author?.username ?? "";
  return review.author?.username ?? "";
}
