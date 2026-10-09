import { forwardRef, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ApiProduct } from "@/lib/api";
import { ReviewDeck } from "./ReviewDeck";
import { SearchBox } from "./SearchBox";
import { useLocale, useStats, type TimelineItem } from "./useHomeData";

const rise = (delay: number) => ({ animationDelay: `${delay}s` });

interface HomeHeroProps {
  narrow: boolean;
  timelines: TimelineItem[];
  popular: ApiProduct[];
  /** Phones: open the search sheet, optionally prefilled. */
  onOpenSearch: (q?: string) => void;
}

/** The first screen: the timeline idea, search, and (wide screens) the review deck. */
export const HomeHero = forwardRef<HTMLDivElement, HomeHeroProps>(function HomeHero(
  { narrow, timelines, popular, onOpenSearch },
  ref,
) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { data: stats } = useStats();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const full = new Intl.NumberFormat(locale);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const fmt = (n: number) => (narrow ? compact : full).format(n);

  const pickPopular = (name: string) => {
    if (narrow) return onOpenSearch(name);
    setQ(name);
    inputRef.current?.focus();
  };

  const statItems = stats
    ? [
        { n: stats.reviews, label: t("landing.hero.statReviews") },
        { n: stats.timelines, label: t("landing.hero.statTimelines") },
        { n: stats.members, label: t("landing.hero.statMembers") },
      ]
    : [];

  return (
    <section className="border-b border-bd-line bg-bd-hero">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-12 px-4 pb-[26px] pt-6 sm:px-6 sm:pb-14 sm:pt-16">
        <div ref={ref} className="min-w-0 flex-[1_1_520px]">
          <div
            className="bd-rise mb-[22px] hidden items-center gap-2 rounded-full border border-bd-line-strong bg-white py-[5px] pl-1.5 pr-3 text-sm text-bd-muted sm:inline-flex"
            style={rise(0)}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bd-logo px-[9px] py-px text-xs font-semibold text-white">
              <span className="bd-ping h-1.5 w-1.5 rounded-full bg-bd-amber" />
              {t("landing.hero.badgeNew")}
            </span>
            {t("landing.hero.badge")}
          </div>

          <h1
            className="bd-display bd-rise mb-3 font-display text-[36px] font-bold leading-[1.05] tracking-[-0.03em] text-bd-navy [text-wrap:balance] sm:mb-[18px] sm:text-[clamp(40px,5.6vw,72px)] sm:leading-[1.02] sm:tracking-[-0.035em]"
            style={rise(0.1)}
          >
            {t("landing.hero.title")}{" "}
            <span className="relative inline-block text-bd-amber-hover">
              {t("landing.hero.highlight")}
              <span
                aria-hidden
                className="bd-underline absolute bottom-px left-0 right-[6%] h-1.5 rounded-[3px] bg-bd-amber opacity-[.28] sm:bottom-0.5 sm:h-2 sm:rounded"
              />
            </span>
          </h1>

          <p
            className="bd-rise mb-[18px] max-w-[560px] text-base leading-normal text-bd-ink2 [text-wrap:pretty] sm:mb-7 sm:text-[19px] sm:leading-[1.55]"
            style={rise(0.2)}
          >
            <span className="sm:hidden">{t("landing.hero.subShort")}</span>
            <span className="hidden sm:inline">{t("landing.hero.sub")}</span>
          </p>

          {narrow ? (
            <button
              type="button"
              onClick={() => onOpenSearch()}
              className="bd-rise flex w-full items-center gap-2.5 rounded-[14px] border-[1.5px] border-bd-line-strong bg-white px-4 py-[15px] text-left text-base text-bd-faint shadow-[0_10px_24px_-14px_rgba(60,40,20,.25)]"
              style={rise(0.25)}
            >
              <Search className="h-4 w-4 flex-none text-bd-muted" aria-hidden />
              {t("landing.search.placeholderMobile")}
            </button>
          ) : (
            <div className="bd-rise relative z-[3] max-w-[600px]" style={rise(0.3)}>
              <SearchBox ref={inputRef} variant="hero" value={q} onChange={setQ} />
            </div>
          )}

          {popular.length > 0 && (
            <div
              className="bd-rise bd-noscroll -mx-4 mt-3.5 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:mt-[18px] sm:flex-wrap sm:overflow-visible sm:px-0"
              style={rise(0.4)}
            >
              <span className="mr-0.5 hidden text-sm text-bd-muted sm:inline">{t("landing.hero.popular")}</span>
              {popular.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPopular(p.name)}
                  className="flex-none rounded-full border border-bd-line-strong bg-white px-3.5 py-[7px] text-sm font-medium text-bd-body hover:border-bd-navy sm:px-[13px] sm:py-[5px]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {statItems.length > 0 && (
            <div
              className="bd-rise mt-5 flex justify-between text-center text-[13px] text-bd-ink2 sm:mt-[34px] sm:flex-wrap sm:justify-start sm:gap-[22px] sm:text-left sm:text-[15px]"
              style={rise(0.5)}
            >
              {statItems.map((s, i) => (
                <span key={s.label} className="contents">
                  {i > 0 && <span className="hidden text-bd-dot sm:inline" aria-hidden>·</span>}
                  <span>
                    <b className="block text-[17px] text-bd-navy sm:inline">{fmt(s.n)}</b> {s.label}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        {!narrow && timelines.length > 0 && (
          <div className="bd-rise min-w-0 max-w-[500px] flex-[1_1_400px]" style={rise(0.35)}>
            <ReviewDeck key={timelines.map((x) => x.id).join()} items={timelines} narrow={false} />
          </div>
        )}
      </div>
    </section>
  );
});
