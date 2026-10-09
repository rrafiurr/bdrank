import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserAvatar } from "@/components/UserAvatar";
import { trimTrail } from "@/lib/reviewDeck";
import { Container, Eyebrow, MoreLink, SectionTitle } from "./bits";
import { useElapsedLabel, type TimelineItem } from "./useHomeData";

/** "How it holds up": reviews whose authors came back to update their rating. */
export function TimelineStrip({ items, isLoading }: { items: TimelineItem[]; isLoading: boolean }) {
  const { t } = useTranslation();
  const elapsed = useElapsedLabel();

  return (
    <section className="pt-7 sm:pt-16">
      <Container className="px-0 sm:px-6">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-4 px-4 sm:mb-5 sm:px-0">
          <div className="min-w-0 flex-1">
            <Eyebrow className="text-bd-badge">{t("landing.holds.eyebrow")}</Eyebrow>
            <div className="flex items-baseline justify-between gap-4">
              <SectionTitle>{t("landing.holds.title")}</SectionTitle>
              <span className="sm:hidden">
                <MoreLink to="/browse" label={t("landing.holds.all")} short={t("landing.all")} />
              </span>
            </div>
            <p className="mb-0 mt-1.5 hidden text-base text-bd-muted sm:block">{t("landing.holds.sub")}</p>
          </div>
          <span className="hidden sm:block">
            <MoreLink to="/browse" label={t("landing.holds.all")} />
          </span>
        </div>

        {isLoading ? (
          <div className="grid gap-4 px-4 sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`h-[230px] animate-pulse rounded-[18px] bg-bd-toggle ${i > 0 ? "hidden sm:block" : ""}`} />
            ))}
          </div>
        ) : items.length === 0 ? (
          // Timelines are the premise of the site, so the section makes its
          // case even before any exist, and points at the action that starts one.
          <div className="mx-4 flex flex-col items-start gap-4 rounded-[18px] border border-dashed border-bd-line-strong bg-white/60 p-5 sm:mx-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="bd-display m-0 font-display text-lg font-semibold">{t("home.timelineEmptyTitle")}</p>
              <p className="m-0 mt-1 max-w-xl text-sm text-bd-muted">{t("home.timelineEmptyBody")}</p>
            </div>
            <Link
              to="/write-review"
              className="rounded-full bg-bd-navy px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-bd-amber hover:text-bd-navy"
            >
              {t("home.timelineEmptyCta")}
            </Link>
          </div>
        ) : (
          <div className="bd-noscroll flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
            {items.map((tl) => {
              const trail = trimTrail(tl.steps, 3);
              const latest = tl.steps[tl.steps.length - 1];
              return (
                <Link
                  key={tl.id}
                  to={`/review/${tl.id}`}
                  className="flex w-[290px] flex-none snap-center flex-col gap-3 rounded-2xl border border-bd-line bg-white p-4 text-bd-navy transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:text-bd-navy hover:shadow-[0_16px_30px_-18px_rgba(60,40,20,.35)] sm:w-auto sm:gap-3.5 sm:rounded-[18px] sm:p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="bd-display truncate font-display text-[15px] font-semibold sm:text-base">{tl.productName}</span>
                    <span className="whitespace-nowrap rounded-full bg-bd-pill px-2 py-0.5 text-[11px] font-semibold text-bd-badge sm:px-[9px] sm:py-[3px] sm:text-xs">
                      ↻ <span className="sm:hidden">{t("landing.number", { value: tl.updates })}</span>
                      <span className="hidden sm:inline">{t("landing.holds.updates", { count: tl.updates })}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-[5px] sm:gap-1.5">
                    {trail.map((s, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className="text-[#c9c0b4]" aria-hidden>→</span>}
                        <span className="flex min-w-[52px] flex-col items-center rounded-[9px] bg-bd-soft px-2 py-[5px] sm:min-w-[58px] sm:rounded-[10px] sm:px-2.5 sm:py-1.5">
                          <b className="text-[15px] sm:text-base">
                            <span className="text-bd-amber">★</span>
                            {s.rating}
                          </b>
                          <span className="font-label text-[10px] font-medium text-bd-muted">{elapsed(s.elapsed, true)}</span>
                        </span>
                      </Fragment>
                    ))}
                  </div>

                  <p className="m-0 line-clamp-4 text-sm leading-normal text-bd-body [text-wrap:pretty] sm:text-[15px] sm:leading-[1.55]">
                    “{latest.text}”
                  </p>

                  <div className="mt-auto flex items-center gap-2 text-xs text-bd-muted sm:text-[13px]">
                    <UserAvatar
                      name={tl.author}
                      src={tl.avatarUrl}
                      anonymous={tl.anonymous}
                      size="xs"
                      className="hidden h-[26px] w-[26px] text-xs sm:flex"
                    />
                    <span className="truncate">{tl.author}</span>
                    {tl.level && (
                      <>
                        <span className="text-bd-dot" aria-hidden>·</span>
                        <span className="font-semibold text-bd-ink2">{tl.level}</span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
