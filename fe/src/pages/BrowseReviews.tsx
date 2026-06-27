import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReviewCard } from "@/components/ReviewCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem } from "@/lib/api";
import { useTranslation } from "react-i18next";

function toCardProps(r: ApiReviewListItem) {
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
    createdAt: new Date(r.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  };
}

const BrowseReviews = () => {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("latest");
  const [ratingFilter, setRatingFilter] = useState("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useQuery({
    queryKey: ["reviews", { category: activeCategory, q: debouncedSearch, sort: sortBy, min_rating: ratingFilter }],
    queryFn: () => {
      const params = new URLSearchParams({ sort: sortBy, limit: "20" });
      if (activeCategory !== "all") params.set("category", activeCategory);
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
      if (ratingFilter !== "all") params.set("min_rating", ratingFilter);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(`/reviews?${params}`);
    },
  });

  const reviews = data?.data ?? [];
  const total = data?.total ?? 0;

  const pageTitle = debouncedSearch
    ? `Search: "${debouncedSearch}" - ReviewHub`
    : "Browse Reviews - ReviewHub";

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title={pageTitle}
        description="Search and filter honest product reviews from our community. Find reviews by category, rating, and more."
      />
      <Header />
      <main className="py-12">
        <div className="container px-4">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
              {t("browse.title")}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t("browse.subtitle")}
            </p>
          </div>

          {/* Search and Filters */}
          <div className="bg-card rounded-2xl border border-border shadow-soft mb-8 overflow-hidden">
            {/* Search bar row */}
            <div className="px-4 py-4 border-b border-border">
              <div className="relative flex items-center">
                <Search className="absolute left-4 h-5 w-5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder={t("browse.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 h-12 rounded-xl bg-muted/40 border-transparent text-base focus:bg-background focus:border-border focus:ring-2 focus:ring-primary/10"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-4 h-6 w-6 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors text-sm"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Filters row */}
            <div className="px-4 py-3 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between bg-muted/20">
                <CategoryFilter
                  activeCategory={activeCategory}
                  onCategoryChange={setActiveCategory}
                />

                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-8 text-sm rounded-full border-border bg-background px-3 gap-1 w-[140px]">
                        <SelectValue placeholder={t("browse.sortBy")} />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="latest">{t("browse.sortLatest")}</SelectItem>
                        <SelectItem value="popular">{t("browse.sortPopular")}</SelectItem>
                        <SelectItem value="rating">{t("browse.sortRating")}</SelectItem>
                        <SelectItem value="comments">{t("browse.sortComments")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Select value={ratingFilter} onValueChange={setRatingFilter}>
                    <SelectTrigger className="h-8 text-sm rounded-full border-border bg-background px-3 gap-1 w-[130px]">
                      <SelectValue placeholder={t("browse.ratingAll")} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">{t("browse.ratingAll")}</SelectItem>
                      <SelectItem value="5">{t("browse.rating5")}</SelectItem>
                      <SelectItem value="4">{t("browse.rating4")}</SelectItem>
                      <SelectItem value="3">{t("browse.rating3")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="mb-6">
            <p className="text-muted-foreground">
              {t("browse.showing")} <span className="font-medium text-foreground">{reviews.length}</span>
              {total > reviews.length && (
                <> {t("browse.of")} <span className="font-medium text-foreground">{total}</span></>
              )}{" "}
              {t("browse.reviews")}
            </p>
          </div>

          {/* Reviews Grid */}
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-[340px] rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : reviews.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reviews.map((review, index) => (
                <div
                  key={review.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <ReviewCard {...toCardProps(review)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="text-muted-foreground mb-4">
                <Search className="h-12 w-12 mx-auto opacity-50" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">{t("browse.noResults")}</h3>
              <p className="text-muted-foreground mb-4">
                {t("browse.noResultsHint")}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setActiveCategory("all");
                  setRatingFilter("all");
                }}
              >
                {t("common.clearFilters")}
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default BrowseReviews;
