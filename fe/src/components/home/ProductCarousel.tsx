import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Container, MoreLink, SectionTitle, Stars, Thumb } from "./bits";
import { useCategoryLabel, useLocale, useRecentProducts } from "./useHomeData";

const SCROLL_STEP = 512;

/** "Recently reviewed": a horizontal, snap-scrolling row of products. */
export function ProductCarousel() {
  const { t } = useTranslation();
  const locale = useLocale();
  const catLabel = useCategoryLabel();
  const { isLoading, products } = useRecentProducts();
  const rail = useRef<HTMLDivElement>(null);

  if (!isLoading && products.length === 0) return null;

  const scroll = (dir: number) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.current?.scrollBy({ left: dir * SCROLL_STEP, behavior: reduce ? "auto" : "smooth" });
  };
  const arrow =
    "grid h-10 w-10 place-items-center rounded-full border border-bd-line-strong bg-white text-bd-navy hover:border-bd-navy";

  return (
    <section className="pt-7 sm:pt-16">
      <Container className="px-0 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-4 px-4 sm:mb-5 sm:px-0">
          <SectionTitle>{t("landing.recent.title")}</SectionTitle>
          <span className="sm:hidden">
            <MoreLink to="/browse" label={t("landing.all")} short={t("landing.all")} />
          </span>
          <div className="hidden gap-2 sm:flex">
            <button type="button" onClick={() => scroll(-1)} className={arrow} aria-label={t("landing.recent.prev")}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => scroll(1)} className={arrow} aria-label={t("landing.recent.next")}>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={rail}
          className="bd-noscroll flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth px-4 pb-1 sm:grid sm:auto-cols-[minmax(220px,240px)] sm:grid-flow-col sm:gap-4 sm:px-0"
        >
          {isLoading
            ? [0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[230px] w-[150px] flex-none animate-pulse rounded-[14px] bg-bd-toggle sm:h-[290px] sm:w-auto sm:rounded-2xl" />
              ))
            : products.map((p) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  className="flex w-[150px] flex-none snap-start flex-col overflow-hidden rounded-[14px] border border-bd-line bg-white text-bd-navy hover:border-[#cfc6ba] hover:text-bd-navy sm:w-auto sm:rounded-2xl"
                >
                  <Thumb src={p.image_url} alt={p.name} className="aspect-square w-full sm:aspect-[4/3]" />
                  <span className="flex flex-col gap-0.5 px-3 pb-3 pt-2.5 sm:gap-1 sm:px-4 sm:pb-4 sm:pt-3.5">
                    <span className="hidden text-xs text-bd-muted sm:block">{catLabel(p.category)}</span>
                    <span className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base sm:leading-[1.3]">{p.name}</span>
                    <span className="flex items-center gap-1.5 text-[13px] sm:mt-1 sm:text-sm">
                      {p.review_count > 0 ? (
                        <>
                          <Stars rating={p.avg_rating} className="hidden sm:inline" />
                          <span className="text-bd-amber sm:hidden" aria-hidden>★</span>
                          <b>{p.avg_rating.toFixed(1)}</b>
                          <span className="text-bd-muted">({new Intl.NumberFormat(locale).format(p.review_count)})</span>
                        </>
                      ) : (
                        // A pinned product may have no reviews yet; 0.0 would read as a real score.
                        <span className="text-bd-muted">{t("landing.recent.noReviews")}</span>
                      )}
                    </span>
                  </span>
                </Link>
              ))}
        </div>
      </Container>
    </section>
  );
}
