import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, Heart, MessageCircle, ChevronLeft, ChevronRight, QrCode } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiReviewListItem, type ApiOwnerProduct } from "@/lib/api";
import { useTranslation } from "react-i18next";

const PAGE_SIZE = 20;

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export default function OwnerDashboard() {
  const { t, i18n } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!loading && (!user || !user.is_product_owner)) navigate("/");
  }, [user, loading, navigate]);

  const { data: products = [] } = useQuery<ApiOwnerProduct[]>({
    queryKey: ["owner-products"],
    queryFn: () => apiFetch<ApiOwnerProduct[]>("/profile/products"),
    enabled: !!user?.is_product_owner,
  });

  const offset = page * PAGE_SIZE;
  const { data, isLoading } = useQuery({
    queryKey: ["owner-reviews", { productId: selectedProduct, offset }],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (selectedProduct !== "all") params.set("product_id", selectedProduct);
      return apiFetch<{ data: ApiReviewListItem[]; total: number }>(
        `/owner/reviews?${params}`
      );
    },
    enabled: !!user?.is_product_owner && !!user?.owner_verified,
  });

  const reviews = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "—";

  const handleProductChange = (val: string) => {
    setSelectedProduct(val);
    setPage(0);
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title={`${user.company_name ?? t("owner.company")} ${t("owner.dashboard")}`}
        noindex
      />
      <Header />
      <main className="py-12">
        <div className="container px-4 max-w-4xl">
          {/* Header strip */}
          <div className="mb-8">
            <h1 className="font-serif text-3xl font-bold text-foreground mb-1">
              {user.company_name ?? `${t("owner.company")} ${t("owner.dashboard")}`}
            </h1>

            {!user.owner_verified ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {t("owner.pendingVerification")}
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{t("owner.totalReviews")}</span>
                  <span className="ml-2 font-semibold text-foreground">
                    {total}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{t("owner.avgRating")}</span>
                  <span className="ml-2 font-semibold text-foreground">
                    {avgRating}
                  </span>
                </div>
                <Link to="/owner-qr" className="ml-auto">
                  <Button variant="outline" size="sm" className="gap-2">
                    <QrCode className="h-4 w-4" />
                    {t("owner.getQrCode")}
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {user.owner_verified && (
            <>
              {/* Filter bar */}
              {products.length > 0 && (
                <div className="mb-6">
                  <Select
                    value={selectedProduct}
                    onValueChange={handleProductChange}
                  >
                    <SelectTrigger className="h-9 w-[220px] text-sm rounded-lg">
                      <SelectValue placeholder={t("owner.allProducts")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("owner.allProducts")}</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Review list */}
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="h-14 rounded-lg bg-muted animate-pulse"
                    />
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>{t("owner.noReviews")}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden bg-card">
                  {reviews.map((review, i) => (
                    <div
                      key={review.id}
                      className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors ${
                        i < reviews.length - 1 ? "border-b border-border" : ""
                      }`}
                    >
                      <Stars rating={review.rating} />
                      <Link
                        to={`/review/${review.id}`}
                        className="flex-1 text-sm font-medium text-foreground hover:text-primary truncate"
                      >
                        {review.title}
                      </Link>
                      {selectedProduct === "all" && (
                        <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                          {review.product.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(review.created_at).toLocaleDateString(
                          i18n.language === "bn" ? "bn-BD" : "en-US",
                          { year: "numeric", month: "short", day: "numeric" }
                        )}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Heart className="h-3.5 w-3.5" />
                          {review.likes_count}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {review.comments_count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {t("owner.previous")}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t("owner.page")} {page + 1} {t("owner.of")} {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    {t("owner.next")}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
