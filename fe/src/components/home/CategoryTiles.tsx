import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  apiFetch,
  type ApiCategory,
  type ApiCategoryStat,
  type ApiProduct,
} from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

/** Drop a thumbnail whose URL fails to load rather than showing a broken glyph. */
function hideBrokenThumb(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

/** Thumbnails of the most-reviewed products in one category, overlapped. */
function ProductStack({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ["home-category-products", slug],
    queryFn: () =>
      apiFetch<{ data: ApiProduct[]; total: number }>(
        `/products?placement=home&category=${encodeURIComponent(slug)}&sort=review_count&limit=3`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  const withImages = (data?.data ?? []).filter((p) => p.image_url);
  if (withImages.length === 0) return null;

  return (
    <div className="mt-auto flex items-center">
      {withImages.map((product, i) => (
        <img
          key={product.id}
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          decoding="async"
          onError={hideBrokenThumb}
          className={`h-8 w-8 rounded-full border-2 border-card object-cover ${i > 0 ? "-ml-2.5" : ""}`}
        />
      ))}
    </div>
  );
}

export function CategoryTiles() {
  const { t } = useTranslation();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<ApiCategory[]>("/categories"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ["category-stats"],
    queryFn: () => apiFetch<ApiCategoryStat[]>("/categories/stats"),
    staleTime: 5 * 60 * 1000,
  });

  const countOf = (slug: string) =>
    stats.find((s) => s.category === slug)?.review_count ?? 0;

  if (isLoading) {
    return (
      <section className="py-5 lg:py-8">
        <div className="container grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[150px] rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  // Production carries categories with no reviews at all. A tile reading
  // "0 reviews" is a dead end, so show only categories with something behind
  // them — unless that would empty the section, in which case show them all.
  const withReviews = categories.filter((c) => countOf(c.slug) > 0);
  const shown = withReviews.length > 0 ? withReviews : categories;

  if (shown.length === 0) return null;

  return (
    <section className="py-5 lg:py-8">
      <div className="container px-4">
        <div className="mb-4 lg:mb-6">
          <h2 className="mb-1 font-serif text-[22px] font-bold text-foreground sm:text-[26px]">
            {t("home.categoriesHeading")}
          </h2>
          <p className="text-[13px] text-muted-foreground sm:text-[15px]">
            {t("home.categoriesSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
          {shown.map((category) => {
            const { icon: Icon, color } = getCategoryDisplay(category.slug);
            return (
              <Link
                key={category.slug}
                to={`/browse?category=${encodeURIComponent(category.slug)}`}
                className="group flex min-h-[140px] flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated lg:min-h-[160px] lg:gap-4 lg:p-5"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${color}`}
                  >
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>

                <div>
                  <p className="font-serif text-xl font-bold text-card-foreground group-hover:text-primary lg:text-[22px]">
                    {category.label}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {t("home.categoryReviews", { count: countOf(category.slug) })}
                  </p>
                </div>

                <ProductStack slug={category.slug} />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
