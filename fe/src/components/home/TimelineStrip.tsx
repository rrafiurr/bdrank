import { Link } from "react-router-dom";
import { Clock, Star, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

// The first rating plus at most this many updates, so the trail never wraps.
const MAX_TRAIL = 4;

/** One rating in the trail. The most recent is highlighted. */
function TrailChip({ rating, latest }: { rating: number; latest: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold ${
        latest ? "bg-primary/10 text-primary" : "bg-muted text-foreground"
      }`}
    >
      <Star className="h-3 w-3 fill-gold text-gold" />
      {rating}
    </span>
  );
}

export function TimelineStrip() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["home-timelines"],
    queryFn: () =>
      apiFetch<{ data: ApiReviewListItem[]; total: number }>(
        "/reviews?timeline_only=true&sort=latest&limit=6",
      ),
    staleTime: 5 * 60 * 1000,
  });

  const reviews = data?.data ?? [];

  if (isLoading) {
    return (
      <section className="py-8 lg:py-12">
        <div className="container px-4">
          <div className="mb-6 h-14 w-64 rounded-xl bg-muted animate-pulse" />
        </div>
        <div className="container flex gap-4 overflow-hidden px-4 pb-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[148px] min-w-[240px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  // A silent section: no timeline reviews means no heading either.
  if (reviews.length === 0) return null;

  return (
    <section className="py-8 lg:py-12">
      <div className="container px-4">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
              {t("home.timelineHeading")}
            </h2>
            <p className="text-[13px] text-muted-foreground sm:text-[15px]">
              {t("home.timelineSubtitle")}
            </p>
          </div>
          <Link
            to="/browse"
            className="group hidden shrink-0 items-center gap-1.5 text-sm font-medium text-primary sm:inline-flex"
          >
            {t("home.seeAllReviews")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      <div className="container flex snap-x gap-3 overflow-x-auto px-4 pb-5 sm:gap-4">
        {reviews.map((review) => {
          const { icon: Icon } = getCategoryDisplay(review.category);
          const updates = review.timeline_ratings ?? [];
          const trail = [review.rating, ...updates].slice(-MAX_TRAIL);
          const image = review.images?.[0];

          return (
            <Link
              key={review.id}
              to={`/review/${review.id}`}
              className="group min-w-[240px] max-w-[240px] shrink-0 snap-start rounded-2xl border border-border/60 bg-card p-4 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:min-w-[268px] sm:max-w-[268px]"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                  {image ? (
                    <img
                      src={image}
                      alt={review.product.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-serif font-semibold text-card-foreground group-hover:text-primary">
                    {review.product.name}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{review.category}</p>
                </div>
              </div>

              <div className="mb-3 flex flex-nowrap items-center gap-1">
                {trail.map((rating, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="h-0.5 w-2.5 rounded-full bg-border" />}
                    <TrailChip rating={rating} latest={i === trail.length - 1} />
                  </div>
                ))}
              </div>

              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {t("home.timelineUpdated", { count: updates.length })}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
