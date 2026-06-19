import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, MessageCircle, Heart, PenSquare, ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiProduct, type ApiReviewListItem } from "@/lib/api";

type SortOrder = "newest" | "oldest" | "highest" | "lowest" | "most_liked";

const toLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ProductReviews() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiFetch<ApiProduct>(`/products/${id}`),
    enabled: !!id,
  });

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ["product-reviews", id, sortOrder],
    queryFn: () =>
      apiFetch<{ data: ApiReviewListItem[]; total: number }>(
        `/products/${id}/reviews?sort=${sortOrder}&limit=50`
      ),
    enabled: !!id,
  });

  const reviews = reviewsData?.data ?? [];

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  if (productLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-48" />
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 py-8">
          <div className="text-center py-20 text-muted-foreground">Product not found.</div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 py-8 md:py-12">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        {/* Product header */}
        <section className="bg-card border border-border rounded-xl p-6 md:p-8 mb-8 shadow-soft">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <Badge variant={product.category as any} className="mb-3">
                {toLabel(product.category)}
              </Badge>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-3">
                {product.name}
              </h1>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-5 w-5 ${
                        i < Math.round(product.avg_rating) ? "fill-gold text-gold" : "text-muted"
                      }`}
                    />
                  ))}
                </div>
                <span className="font-semibold text-foreground">{product.avg_rating.toFixed(1)}</span>
                <span className="text-muted-foreground text-sm">
                  ({product.review_count} {product.review_count === 1 ? "review" : "reviews"})
                </span>
              </div>
            </div>

            <Button variant="hero" onClick={() => navigate("/write-review")}>
              <PenSquare className="h-4 w-4 mr-2" />
              Write a Review
            </Button>
          </div>
        </section>

        {/* Sort + reviews list */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-serif text-2xl font-semibold text-foreground">Reviews</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">Sort by:</span>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="highest">Highest rated</SelectItem>
                  <SelectItem value="lowest">Lowest rated</SelectItem>
                  <SelectItem value="most_liked">Most liked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {reviewsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <p className="text-muted-foreground mb-4">
                No reviews yet. Be the first to share your experience!
              </p>
              <Button variant="hero" onClick={() => navigate("/write-review")}>
                Write the first review
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="bg-card border border-border rounded-xl p-6 shadow-soft hover:shadow-elevated transition-shadow"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      {review.author.avatar_url ? (
                        <img
                          src={review.author.avatar_url}
                          alt={review.author.username}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                          {review.author.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-card-foreground">{review.author.username}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(review.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`h-4 w-4 ${
                            i < review.rating ? "fill-gold text-gold" : "text-muted"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <h3 className="font-serif text-lg font-semibold text-card-foreground mb-2">
                    {review.title}
                  </h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-line mb-4">
                    {review.excerpt}
                  </p>

                  <div className="flex items-center gap-4 text-muted-foreground pt-3 border-t border-border">
                    <span className="flex items-center gap-1 text-sm">
                      <Heart className="h-4 w-4" />
                      {review.likes_count}
                    </span>
                    <span className="flex items-center gap-1 text-sm">
                      <MessageCircle className="h-4 w-4" />
                      {review.comments_count}
                    </span>
                    <Link
                      to={`/review/${review.id}`}
                      className="ml-auto text-sm text-primary hover:underline"
                    >
                      View details →
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
