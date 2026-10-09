import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { bn, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { sourceLabel } from "@/lib/reviewSource";
import { Container, Pill, SectionTitle, Stars, Thumb } from "./bits";
import { reviewAuthor, useCategories, useLatestReviews } from "./useHomeData";

// Phones show the first three; wider screens all six.
const PHONE_LIMIT = 3;

export function LatestReviews() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language?.startsWith("bn") ? bn : enUS;
  const [tab, setTab] = useState("all");
  const { data: categories = [] } = useCategories();
  const { data, isLoading } = useLatestReviews(tab);
  const reviews = data?.data ?? [];

  const tabs = [{ slug: "all", label: t("landing.latest.all") }, ...categories];

  return (
    <section className="pt-7 sm:pt-16">
      <Container className="px-0 sm:px-6">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-4 px-4 sm:mb-4 sm:px-0">
          <SectionTitle>{t("landing.latest.title")}</SectionTitle>
          <div className="bd-noscroll -mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0">
            {tabs.map((c) => (
              <Pill key={c.slug} active={tab === c.slug} onClick={() => setTab(c.slug)}>
                {c.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-4 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] sm:gap-4 sm:px-0">
          {isLoading ? (
            [0, 1, 2].map((i) => <div key={i} className="h-[220px] animate-pulse rounded-2xl bg-bd-toggle sm:rounded-[18px]" />)
          ) : reviews.length === 0 ? (
            <p className="py-10 text-center text-bd-muted sm:col-span-full">{t("home.noReviews")}</p>
          ) : (
            reviews.map((r, i) => {
              const who = reviewAuthor(r, t("review.anonymous"));
              return (
                <article
                  key={r.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl border border-bd-line bg-white p-3.5 sm:gap-2.5 sm:rounded-[18px] sm:p-5",
                    i >= PHONE_LIMIT && "hidden sm:flex",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      name={who.name}
                      src={who.avatarUrl}
                      anonymous={who.anonymous}
                      size="xs"
                      className="sm:h-9 sm:w-9"
                    />
                    <div className="min-w-0 flex-1 text-[13px] leading-[1.3] sm:text-sm">
                      <div className="truncate font-semibold">
                        {who.name}
                        {who.level && <span className="text-[11px] font-semibold text-bd-badge sm:text-xs"> · {who.level}</span>}
                      </div>
                      <div className="text-xs text-bd-muted sm:text-[13px]">
                        {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true, locale: dateLocale })}
                        {r.source && <> · {t("review.viaSource", { source: sourceLabel(r.source) })}</>}
                      </div>
                    </div>
                    <Stars rating={r.rating} className="text-sm sm:text-base" />
                  </div>

                  <Link
                    to={`/review/${r.id}`}
                    className="bd-display font-display text-base font-semibold leading-[1.3] text-bd-navy hover:text-bd-amber-ink sm:text-[17px]"
                  >
                    {r.title}
                  </Link>
                  <p className="m-0 line-clamp-4 text-sm leading-normal text-bd-body [text-wrap:pretty] sm:text-[15px] sm:leading-[1.55]">
                    {r.excerpt}
                  </p>

                  {r.images?.length > 0 && (
                    <div className="hidden gap-1.5 sm:flex">
                      {r.images.slice(0, 2).map((src) => (
                        <Thumb key={src} src={src} alt={r.product.name} className="h-14 w-14 rounded-lg" />
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#f2ede6] pt-2 text-xs text-bd-muted sm:pt-2.5 sm:text-[13px]">
                    <Link to={`/product/${r.product.id}`} className="truncate font-semibold text-bd-navy hover:text-bd-amber-ink">
                      {r.product.name}
                    </Link>
                    <span className="flex flex-none items-center gap-1">
                      <Heart className="h-3.5 w-3.5" aria-hidden />
                      <span className="sr-only">{t("landing.latest.likes")}</span>
                      {r.likes_count}
                    </span>
                  </div>
                </article>
              );
            })
          )}

          <div className="mt-1 flex justify-center sm:col-span-full sm:mt-2">
            <Link
              to="/browse"
              className="w-full rounded-full border border-bd-navy p-3 text-center text-[15px] font-semibold text-bd-navy transition-colors hover:bg-bd-navy hover:text-white sm:w-auto sm:px-[22px] sm:py-2.5"
            >
              {t("landing.latest.browseAll")}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
