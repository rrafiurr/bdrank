import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, MessageCircle, Clock, Heart, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface ReviewCardProps {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  authorAvatar: string;
  rating: number;
  category: string;
  productName: string;
  imageUrl: string;
  commentsCount: number;
  likesCount: number;
  isTimeline?: boolean;
  timelineUpdates?: number;
  createdAt: string;
}

export function ReviewCard({
  id,
  title,
  excerpt,
  author,
  authorAvatar,
  rating,
  category,
  productName,
  imageUrl,
  commentsCount,
  likesCount,
  isTimeline,
  timelineUpdates,
  createdAt,
}: ReviewCardProps) {
  const { t } = useTranslation();
  const categoryLabel =
    category.charAt(0).toUpperCase() + category.slice(1);

  return (
    <Link to={`/review/${id}`}>
      <article className="group bg-card rounded-2xl overflow-hidden border border-border/60 shadow-soft hover:shadow-elevated transition-all duration-300 hover:-translate-y-1">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={productName}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-3 left-3 flex gap-2">
            <Badge variant={category as any}>{categoryLabel}</Badge>
            {isTimeline && (
              <Badge variant="gold" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t("review.timelineUpdates", { count: timelineUpdates ?? 0 })}
              </Badge>
            )}
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-1 mb-3">
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

          <h3 className="font-serif text-lg font-semibold text-card-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {title}
          </h3>

          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {excerpt}
          </p>

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={authorAvatar} alt={author} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {author.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-card-foreground">{author}</p>
                <p className="text-xs text-muted-foreground">{createdAt}</p>
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
