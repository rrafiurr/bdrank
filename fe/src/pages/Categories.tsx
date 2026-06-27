import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReviewCard } from "@/components/ReviewCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem, type ApiCategoryStat, type ApiCategory } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

function toCardProps(r: ApiReviewListItem, locale: string) {
  return {
    id: String(r.id),
    title: r.title,
    excerpt: r.excerpt,
    author: r.author.username,
    authorAvatar: r.author.avatar_url,
    rating: r.rating,
    category: r.category,
    productName: r.product.name,
    imageUrl: r.images?.[0] ?? "",
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

export default function Categories() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "bn" ? "bn-BD" : "en-US";
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get("type");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiCategory[]>("/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats } = useQuery({
    queryKey: ["categories-stats"],
    queryFn: () => apiFetch<ApiCategoryStat[]>("/categories/stats"),
  });

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", { category: selectedCategory ?? "all", limit: 20 }],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "20" });
      if (selectedCategory) params.set("category", selectedCategory);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(`/reviews?${params}`);
    },
  });

  const reviews = reviewsData?.data ?? [];

  const getCount = (slug: string) =>
    stats?.find((s) => s.category === slug)?.review_count ?? 0;

  const selectedLabel =
    categories.find((c) => c.slug === selectedCategory)?.label ?? t("categories.allReviews");

  const catTitle = selectedCategory
    ? `${selectedLabel} Reviews - ReviewHub`
    : "Browse by Category - ReviewHub";

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title={catTitle}
        description={
          selectedCategory
            ? `Read honest ${selectedLabel.toLowerCase()} reviews from our community.`
            : "Browse product reviews by category — physical products, digital services, and more."
        }
      />
      <Header />

      <main className="container px-4 py-12">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-foreground mb-4">
            {t("categories.title")}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t("categories.subtitle")}
          </p>
        </div>

        {/* Category Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {categories.map((cat) => {
            const { icon: Icon, color, borderColor } = getCategoryDisplay(cat.slug);
            const isSelected = selectedCategory === cat.slug;
            const count = getCount(cat.slug);

            return (
              <Link
                key={cat.slug}
                to={`/categories?type=${cat.slug}`}
                className={`group relative overflow-hidden rounded-2xl border ${borderColor} bg-gradient-to-br ${color} p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-elevated ${isSelected ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-background/80 backdrop-blur-sm">
                    <Icon className="h-6 w-6 text-foreground" />
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {t("categories.reviews", { count })}
                  </Badge>
                </div>

                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">
                  {cat.label}
                </h3>

                <div className="flex items-center text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  {t("categories.viewReviews")}
                  <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Reviews Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-serif text-2xl font-semibold text-foreground">
                {selectedCategory ? selectedLabel : t("categories.allReviews")}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                {reviewsLoading
                  ? t("common.loading")
                  : t("categories.found", { count: reviews.length })}
              </p>
            </div>
            {selectedCategory && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/categories">{t("categories.viewAllCategories")}</Link>
              </Button>
            )}
          </div>

          {reviewsLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-[340px] rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.map((review) => (
                <ReviewCard key={review.id} {...toCardProps(review, locale)} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
