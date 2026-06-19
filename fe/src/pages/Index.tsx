import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { ReviewCard } from "@/components/ReviewCard";
import { TimelinePreview } from "@/components/TimelinePreview";
import { CategoryFilter } from "@/components/CategoryFilter";
import { ReviewedProducts } from "@/components/ReviewedProducts";
import { ReviewedProductsGrid } from "@/components/ReviewedProductsGrid";
import { FeaturesSection } from "@/components/FeaturesSection";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewListItem, type ApiReviewDetail } from "@/lib/api";

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

const Index = () => {
  const [activeCategory, setActiveCategory] = useState("all");

  // Latest reviews (category-filtered)
  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", { category: activeCategory, sort: "latest", limit: 6 }],
    queryFn: () => {
      const params = new URLSearchParams({ sort: "latest", limit: "6" });
      if (activeCategory !== "all") params.set("category", activeCategory);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(`/reviews?${params}`);
    },
  });

  // Featured timeline: get the first timeline review id
  const { data: tlListData } = useQuery({
    queryKey: ["featured-timeline-list"],
    queryFn: () =>
      apiFetch<{ data: ApiReviewListItem[]; total: number }>("/reviews?timeline_only=true&limit=1"),
  });
  const featuredId = tlListData?.data?.[0]?.id;

  // Fetch full detail for the featured timeline review
  const { data: featured } = useQuery({
    queryKey: ["review", featuredId],
    queryFn: () => apiFetch<ApiReviewDetail>(`/reviews/${featuredId}`),
    enabled: !!featuredId,
  });

  const reviews = reviewsData?.data ?? [];

  const timelineProps = featured && featured.timeline?.length > 0
    ? {
        productName: featured.title,
        productImage: featured.product.image_url || featured.images?.[0] || "",
        author: featured.author.username,
        entries: featured.timeline.map((t) => ({
          date: new Date(t.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
          }),
          period: t.title,
          rating: t.rating,
          summary: t.content,
        })),
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />

        {/* Featured Timeline Review */}
        {timelineProps && (
          <section className="py-16 container px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-serif text-2xl font-bold text-foreground mb-2">
                  Featured Timeline Review
                </h2>
                <p className="text-muted-foreground">
                  See how products perform over time
                </p>
              </div>
              <Link to="/browse">
                <Button variant="ghost" className="group hidden sm:flex">
                  View All Timelines
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
            <TimelinePreview {...timelineProps} />
          </section>
        )}

        {/* Reviewed Products */}
        <section className="py-8 container px-4">
          <div className="mb-6">
            <h2 className="font-serif text-2xl font-bold text-foreground mb-2">
              Products Reviewed by Our Community
            </h2>
            <p className="text-muted-foreground">
              Browse products that users have shared their experience with
            </p>
          </div>
          <ReviewedProducts />
        </section>

        {/* Top Reviewed Products Grid */}
        <section className="py-8 container px-4">
          <div className="mb-6">
            <h2 className="font-serif text-2xl font-bold text-foreground mb-2">
              Top Reviewed Products & Brands
            </h2>
            <p className="text-muted-foreground">
              The most reviewed products and brands across our community
            </p>
          </div>
          <ReviewedProductsGrid />
        </section>

        {/* Latest Reviews */}
        <section className="py-16 bg-secondary/20">
          <div className="container px-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="font-serif text-2xl font-bold text-foreground mb-2">
                  Latest Reviews
                </h2>
                <p className="text-muted-foreground">
                  Fresh insights from our community
                </p>
              </div>
              <CategoryFilter
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
              />
            </div>

            {reviewsLoading ? (
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
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <ReviewCard {...toCardProps(review)} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12">
                No reviews found.
              </p>
            )}

            <div className="text-center mt-12">
              <Link to="/browse">
                <Button variant="outline" size="lg" className="group">
                  Load More Reviews
                  <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <FeaturesSection />

        {/* CTA Section */}
        <section className="py-20 bg-gradient-warm">
          <div className="container px-4 text-center">
            <h2 className="font-serif text-3xl font-bold text-primary-foreground mb-4">
              Ready to Share Your Experience?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              Join thousands of reviewers helping others make informed decisions. Your honest opinion matters.
            </p>
            <Link to="/auth">
              <Button variant="secondary" size="xl" className="shadow-elevated">
                Create Your Account
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
