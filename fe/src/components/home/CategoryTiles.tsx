import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Container, MoreLink, SectionTitle, Thumb } from "./bits";
import { useCategoryCounts, useCategoryProducts } from "./useHomeData";

const KNOWN = ["physical", "digital", "service", "food"];

function TileThumbs({ slug }: { slug: string }) {
  const { data } = useCategoryProducts(slug);
  const products = data?.data ?? [];
  // Always three slots, so tiles line up whether or not products have photos.
  return (
    <span className="flex gap-1 sm:gap-2">
      {[0, 1, 2].map((i) => (
        <Thumb
          key={i}
          src={products[i]?.image_url}
          alt={products[i]?.name ?? ""}
          className="aspect-square flex-1 rounded-[7px] sm:rounded-[10px]"
        />
      ))}
    </span>
  );
}

export function CategoryTiles() {
  const { t } = useTranslation();
  const { isLoading, categories } = useCategoryCounts();

  if (!isLoading && categories.length === 0) return null;

  return (
    <section id="categories" className="pt-7 sm:pt-14">
      <Container>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4 sm:mb-5">
          <SectionTitle>
            <span className="sm:hidden">{t("landing.categories.titleShort")}</span>
            <span className="hidden sm:inline">{t("landing.categories.title")}</span>
          </SectionTitle>
          <MoreLink to="/categories" label={t("landing.categories.all")} short={t("landing.all")} />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          {isLoading
            ? [0, 1, 2, 3].map((i) => <div key={i} className="h-[150px] animate-pulse rounded-[14px] bg-bd-toggle sm:h-[190px] sm:rounded-[18px]" />)
            : categories.map((c) => (
                <Link
                  key={c.slug}
                  to={`/browse?category=${encodeURIComponent(c.slug)}`}
                  className="flex flex-col gap-2.5 rounded-[14px] border border-bd-line bg-white p-3.5 text-bd-navy transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:text-bd-navy hover:shadow-[0_16px_30px_-18px_rgba(60,40,20,.35)] sm:gap-3.5 sm:rounded-[18px] sm:p-5"
                >
                  <div className="order-2 flex items-start justify-between gap-2.5 sm:order-1">
                    <div>
                      <div className="bd-display font-display text-[15px] font-semibold leading-tight sm:text-xl">{c.label}</div>
                      {KNOWN.includes(c.slug) && (
                        <div className="mt-0.5 hidden text-sm text-bd-muted sm:block">{t(`landing.categories.desc.${c.slug}`)}</div>
                      )}
                      <div className="font-label text-[11px] font-medium text-bd-muted sm:hidden">
                        {t("landing.reviewsCount", { count: c.count })}
                      </div>
                    </div>
                    <span className="hidden whitespace-nowrap rounded-md bg-bd-hero px-2 py-1 font-label text-xs font-medium text-bd-ink2 sm:inline">
                      {t("landing.number", { value: c.count })}
                    </span>
                  </div>
                  <div className="order-1 sm:order-2">
                    <TileThumbs slug={c.slug} />
                  </div>
                </Link>
              ))}
        </div>
      </Container>
    </section>
  );
}
