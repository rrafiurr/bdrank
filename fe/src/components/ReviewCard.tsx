import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { LevelBadge } from "@/components/LevelBadge";
import { Star, MessageCircle, Clock, Heart } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ApiAuthorBadge } from "@/lib/api";
import { sourceLabel } from "@/lib/reviewSource";

interface ReviewCardProps {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  authorAvatar: string;
  authorBadge?: ApiAuthorBadge | null;
  isAnonymous?: boolean;
  /** Platform an imported review came from ("google"); empty for native ones. */
  source?: string;
  /** Name the review carried on that platform — the real author to credit. */
  sourceAuthor?: string;
  rating: number;
  category: string;
  productName: string;
  images: string[];
  commentsCount: number;
  likesCount: number;
  isTimeline?: boolean;
  timelineUpdates?: number;
  createdAt: string;
}

// Photo strip: up to this many thumbnails, then a "+N" chip for the rest.
const MAX_THUMBS = 2;

// Hide a thumbnail whose URL fails to load, rather than showing the browser's
// broken-image glyph. Kept module-level so it isn't recreated per render.
function hideBrokenThumb(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}


export function ReviewCard({
  id,
  title,
  excerpt,
  author,
  authorAvatar,
  authorBadge,
  isAnonymous,
  source,
  sourceAuthor,
  rating,
  category,
  productName,
  images,
  commentsCount,
  likesCount,
  isTimeline,
  timelineUpdates,
  createdAt,
}: ReviewCardProps) {
  const { t } = useTranslation();

  // An imported review is owned by the import-bot account, so the real credit
  // lives in sourceAuthor. Fall back to the account name if it is missing.
  const isImported = Boolean(source);
  const displayName = isImported ? sourceAuthor || author : author;
  const categoryLabel =
    category.charAt(0).toUpperCase() + category.slice(1);

  const thumbs = images.slice(0, MAX_THUMBS);
  const extraCount = images.length - thumbs.length;

  return (
    <Link to={`/review/${id}`}>
      <article className="group bg-card rounded-2xl overflow-hidden border border-border/60 shadow-soft hover:shadow-elevated transition-all duration-300 hover:-translate-y-1">
        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < rating ? "fill-gold text-gold" : "text-muted"
                  }`}
                />
              ))}
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                {rating}.0
              </span>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              <Badge variant={category as any}>{categoryLabel}</Badge>
              {isTimeline && (
                <Badge variant="gold" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("review.timelineUpdates", { count: timelineUpdates ?? 0 })}
                </Badge>
              )}
            </div>
          </div>

          <h3 className="font-serif text-lg font-semibold text-card-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>

          <p className="text-sm text-muted-foreground mb-4 line-clamp-4">
            {excerpt}
          </p>

          {thumbs.length > 0 && (
            <div className="flex items-center gap-2 mb-4">
              {thumbs.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={productName}
                  loading="lazy"
                  decoding="async"
                  onError={hideBrokenThumb}
                  className="h-16 w-16 rounded-lg object-cover border border-border/60"
                />
              ))}
              {extraCount > 0 && (
                <span className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">
                  +{extraCount}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <UserAvatar
                name={isAnonymous ? "" : displayName}
                src={isAnonymous || isImported ? undefined : authorAvatar}
                size="xs"
                anonymous={isAnonymous}
              />
              <div>
                <p className="text-sm font-medium text-card-foreground flex items-center gap-1.5">
                  {isAnonymous ? t("review.anonymous") : displayName}
                  {/* Imported reviews are owned by the import-bot account, so
                      its rewards level would say nothing about the real author. */}
                  {authorBadge && !isImported && <LevelBadge {...authorBadge} />}
                </p>
                <p className="text-xs text-muted-foreground">
                  {createdAt}
                  {isImported && (
                    <> · {t("review.viaSource", { source: sourceLabel(source) })}</>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="flex items-center gap-1 text-sm">
                <Heart className="h-4 w-4" />
                {likesCount}
              </span>
              <span className="flex items-center gap-1 text-sm">
                <MessageCircle className="h-4 w-4" />
                {commentsCount}
              </span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
