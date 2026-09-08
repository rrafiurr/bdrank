import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem } from "@/lib/api";
import { toCardProps } from "@/lib/reviewCardProps";
import { ReviewCard } from "@/components/ReviewCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { useTranslation } from "react-i18next";

export function LatestReviews() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "bn" ? "bn-BD" : "en-US";
  const [activeCategory, setActiveCategory] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["reviews", { category: activeCategory, sort: "latest", limit: 3 }],
    queryFn: () => {
      const params = new URLSearchParams({ sort: "latest", limit: "3" });
      if (activeCategory !== "all") params.set("category", activeCategory);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(`/reviews?${params}`);
    },
  });

  const reviews = data?.data ?? [];

  return (
    <section className="bg-secondary/50 py-7 lg:py-12">
      <div className="container px-4">
        <div className="mb-4 flex items-end justify-between gap-4 lg:mb-6">
          <div>
            <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
              {t("home.latestReviews")}
            </h2>
            <p className="text-[13px] text-muted-foreground sm:text-[15px]">
              {t("home.latestSubtitle")}
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

        <div className="mb-4 lg:mb-6">
          <CategoryFilter activeCategory={activeCategory} onCategoryChange={setActiveCategory} />
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-3 lg:gap-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`h-[340px] rounded-2xl bg-muted animate-pulse ${i === 2 ? "hidden md:block" : ""}`}
              />
            ))}
          </div>
        ) : reviews.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3 lg:gap-6">
            {reviews.map((review, index) => (
              <div
                key={review.id}
                // The third card is desktop-only: the phone shows two.
                className={`animate-fade-in ${index === 2 ? "hidden md:block" : ""}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <ReviewCard {...toCardProps(review, locale)} />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-muted-foreground">{t("home.noReviews")}</p>
        )}

        <div className="mt-6 text-center sm:hidden">
          <Link to="/browse" className="text-sm font-medium text-primary">
            {t("home.seeAllReviews")}
          </Link>
        </div>
      </div>
    </section>
  );
}
