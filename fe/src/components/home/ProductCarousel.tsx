import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { apiFetch, type ApiProduct } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

// Hide a photo whose URL fails to load, revealing the category icon beneath
// it rather than the browser's broken-image glyph.
function hideBrokenImage(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

export function ProductCarousel() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ["home-recent-products"],
    queryFn: () =>
      apiFetch<{ data: ApiProduct[]; total: number }>(
        "/products?sort=recent_review&limit=12",
      ),
    staleTime: 5 * 60 * 1000,
  });

  // A product with no approved reviews has nothing to say here, and the sort
  // puts them last anyway.
  const products = (data?.data ?? []).filter((p) => p.review_count > 0);

  if (isLoading) {
    return (
      <section className="pt-6 lg:pt-10">
        <div className="container px-4">
          <div className="mb-5 h-12 w-56 rounded-xl bg-muted animate-pulse" />
        </div>
        <div className="container flex gap-4 overflow-hidden px-4 pb-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-[236px] min-w-[190px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="pt-6 lg:pt-10">
      <div className="container px-4">
        <div className="mb-5">
          <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
            {t("home.productsHeading")}
          </h2>
          <p className="text-[13px] text-muted-foreground sm:text-[15px]">
            {t("home.productsSubtitle")}
          </p>
        </div>
      </div>

      <div className="container flex snap-x scroll-pl-4 gap-3 overflow-x-auto px-4 pb-4 sm:gap-4">
        {products.map((product) => {
          const { icon: Icon, badgeVariant } = getCategoryDisplay(product.category);
          return (
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="group min-w-[172px] max-w-[172px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated sm:min-w-[196px] sm:max-w-[196px]"
            >
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
                <Icon className="h-8 w-8 text-muted-foreground" />
                {product.image_url && (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    onError={hideBrokenImage}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                )}
              </div>

              <div className="p-3.5">
                <Badge variant={badgeVariant} className="mb-2">
                  {product.category}
                </Badge>
                <h3 className="line-clamp-1 font-serif font-semibold text-card-foreground transition-colors group-hover:text-primary">
                  {product.name}
                </h3>
                <div className="mt-1.5 flex items-center justify-between text-[13px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                    {product.avg_rating.toFixed(1)}
                  </span>
                  <span>{t("home.productsReviewCount", { count: product.review_count })}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
