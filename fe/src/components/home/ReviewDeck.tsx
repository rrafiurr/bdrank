import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  advanceDeck,
  DECK_TICK_MS,
  initialDeck,
  stackPosition,
  trimTrail,
  type DeckState,
} from "@/lib/reviewDeck";
import { Stars, Thumb } from "./bits";
import { useCategoryLabel, useElapsedLabel, type TimelineItem } from "./useHomeData";

// Transforms for the cards behind the front one. Phones use half the offsets.
const STACK = {
  wide: ["none", "translate(16px,-16px) rotate(2.5deg) scale(.96)", "translate(30px,-30px) rotate(5deg) scale(.92)"],
  narrow: ["none", "translate(8px,-8px) rotate(2deg) scale(.97)", "translate(15px,-15px) rotate(4deg) scale(.94)"],
};
const OPACITY = [1, 0.85, 0.6];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Up to three timeline reviews stacked like cards. Autoplay walks the front
 * card through its timeline (Day 1 → later updates), then rotates the next
 * card to the front. Hover or touch pauses; picking a step pauses.
 */
export function ReviewDeck({ items, narrow }: { items: TimelineItem[]; narrow: boolean }) {
  const { t } = useTranslation();
  const elapsed = useElapsedLabel();
  const catLabel = useCategoryLabel();

  const cards = useMemo(
    () => items.slice(0, 3).map((it) => ({ ...it, steps: trimTrail(it.steps, 3) })),
    [items],
  );
  const stepCounts = useMemo(() => cards.map((c) => c.steps.length), [cards]);
  const [deck, setDeck] = useState<DeckState>(() => initialDeck(stepCounts, reducedMotion()));
  // Hover is tracked apart from `deck.paused` so leaving the card resumes play
  // without undoing a deliberate pick.
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (deck.paused || hovered) return;
    const id = setInterval(() => setDeck((s) => advanceDeck(s, stepCounts)), DECK_TICK_MS);
    return () => clearInterval(id);
  }, [deck.paused, hovered, stepCounts]);

  if (cards.length === 0) return null;

  const playing = !deck.paused && !hovered;
  const stack = narrow ? STACK.narrow : STACK.wide;
  const pickStep = (step: number) => setDeck((s) => ({ ...s, step, paused: true }));
  const pickCard = (card: number) => setDeck((s) => ({ card, step: 0, paused: narrow ? true : s.paused }));

  return (
    <div>
      {narrow && (
        <div className="mb-2.5 flex items-baseline justify-between">
          <div className="font-label text-[11px] font-medium uppercase tracking-[0.08em] text-bd-badge">
            {t("landing.deck.liveLabel")}
          </div>
          <span className="font-label text-[11px] font-medium text-bd-faint">
            {deck.card + 1} / {cards.length}
          </span>
        </div>
      )}

      <div
        className={cn("grid", narrow ? "pr-3.5 pt-3.5" : "bd-float pr-[30px] pt-[30px]")}
        onMouseEnter={narrow ? undefined : () => setHovered(true)}
        onMouseLeave={narrow ? undefined : () => setHovered(false)}
        onTouchStart={narrow ? () => setDeck((s) => ({ ...s, paused: true })) : undefined}
      >
        {cards.map((c, i) => {
          const pos = stackPosition(i, deck.card, cards.length);
          const front = pos === 0;
          // Cards behind the front one rest on their latest update.
          const cur = front ? Math.min(deck.step, c.steps.length - 1) : c.steps.length - 1;
          return (
            <article
              key={c.id}
              aria-hidden={!front}
              // `inert` keeps the hidden cards' buttons out of the tab order.
              {...(!front ? { inert: "" } : {})}
              className={cn(
                "bd-card-move border border-[#e6e0d7] bg-white [grid-area:1/1]",
                narrow
                  ? "rounded-[18px] p-4 shadow-[0_20px_40px_-24px_rgba(20,33,61,.35)]"
                  : "rounded-[20px] p-[22px] shadow-[0_30px_60px_-30px_rgba(20,33,61,.35)]",
              )}
              style={{
                transform: stack[pos] ?? stack[2],
                opacity: OPACITY[pos] ?? 0.6,
                zIndex: 3 - pos,
                pointerEvents: front ? "auto" : "none",
              }}
            >
              <div className={cn("flex items-center", narrow ? "mb-3 gap-2.5" : "mb-4 gap-3")}>
                <Thumb
                  src={c.productImage}
                  alt={c.productName}
                  className={narrow ? "h-[42px] w-[42px] rounded-[10px]" : "h-[52px] w-[52px] rounded-xl"}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/review/${c.id}`}
                    tabIndex={front ? 0 : -1}
                    className={cn("block truncate font-semibold text-bd-navy hover:text-bd-amber-ink", narrow ? "text-[15px]" : "text-base")}
                  >
                    {c.productName}
                  </Link>
                  <div className={cn("truncate text-bd-muted", narrow ? "text-xs" : "text-[13px]")}>
                    {narrow ? (
                      <>
                        {c.author}
                        {c.level && <> · <b className="text-bd-badge">{c.level}</b></>} ·{" "}
                        {t("landing.deck.cameBack", { times: c.updates })}
                      </>
                    ) : (
                      <>
                        {catLabel(c.category)} · {t("landing.deck.by", { author: c.author })}
                        {c.level && <> · <span className="font-semibold text-bd-badge">{c.level}</span></>}
                      </>
                    )}
                  </div>
                </div>
                {!narrow && (
                  <span className="whitespace-nowrap rounded-full bg-bd-pill px-[9px] py-[3px] text-xs font-semibold text-bd-badge">
                    ↻ {t("landing.number", { value: c.updates })}
                  </span>
                )}
              </div>

              {narrow ? (
                <>
                  <div className="mb-2.5 flex gap-1.5">
                    {c.steps.map((s, k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => pickStep(k)}
                        aria-pressed={k === cur}
                        className={cn(
                          "relative flex min-h-[44px] flex-1 flex-col items-center gap-px overflow-hidden rounded-[10px] border-[1.5px] px-1 py-[7px] text-bd-navy transition-all duration-[400ms]",
                          k === cur ? "border-bd-amber bg-[#fff8ea]" : "border-bd-line bg-white",
                          k <= cur ? "opacity-100" : "opacity-40",
                        )}
                      >
                        <b className="text-[15px]">
                          <span className="text-bd-amber">★</span>
                          {s.rating}
                        </b>
                        <span className="font-label text-[10px] font-medium text-bd-muted">{elapsed(s.elapsed, true)}</span>
                        {front && k === cur && playing && (
                          <span key={`${deck.card}-${cur}`} className="bd-progress absolute inset-x-0 bottom-0 h-[3px] bg-bd-amber" />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="m-0 line-clamp-3 min-h-[42px] text-sm leading-normal text-bd-body">“{c.steps[cur].text}”</p>
                </>
              ) : (
                <>
                  <div className="mb-2.5 font-label text-[11px] font-medium uppercase tracking-[0.06em] text-bd-faint">
                    {t("landing.deck.timelineLabel")}
                  </div>
                  <div className="flex flex-col">
                    {c.steps.map((s, k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => pickStep(k)}
                        aria-pressed={k === cur}
                        className={cn(
                          "relative flex gap-3.5 overflow-hidden rounded-xl p-2.5 text-left text-bd-navy transition-[opacity,background] duration-500",
                          front && k === cur ? "bg-bd-hover" : "bg-transparent",
                          k <= cur ? "opacity-100" : "opacity-35",
                        )}
                      >
                        <span className="flex-none pt-[3px]">
                          <span
                            className={cn(
                              "block h-3.5 w-3.5 rounded-full border-[3px] border-bd-logo transition-colors duration-[400ms]",
                              k <= cur ? "bg-bd-logo" : "bg-white",
                            )}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <b className="text-[15px]">{elapsed(s.elapsed)}</b>
                            <Stars rating={s.rating} className="text-[15px]" />
                          </span>
                          <span className="mt-[3px] line-clamp-2 block text-sm leading-normal text-bd-ink2">{s.text}</span>
                          {front && k === cur && playing && (
                            <span
                              key={`${deck.card}-${cur}`}
                              className="bd-progress absolute bottom-1 left-2.5 right-2.5 h-0.5 rounded-sm bg-bd-amber"
                            />
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className={cn("flex items-center justify-between gap-3", narrow ? "mt-3" : "mt-[18px] pr-[30px]")}>
        <div className={cn("flex gap-1.5", narrow ? "bd-noscroll overflow-x-auto" : "flex-wrap")}>
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pickCard(i)}
              aria-pressed={i === deck.card}
              className={cn(
                "max-w-[180px] flex-none truncate rounded-full border px-3 py-[5px] text-[13px] font-medium transition-all duration-300 sm:py-[5px]",
                i === deck.card ? "border-bd-navy bg-bd-navy text-white" : "border-bd-line-strong bg-white text-bd-body",
              )}
            >
              {c.productName}
            </button>
          ))}
        </div>
        {!narrow && (
          <span className="whitespace-nowrap font-label text-xs font-medium text-bd-faint">
            {deck.card + 1} / {cards.length}
          </span>
        )}
      </div>
      <p className={cn("mb-0 leading-normal text-bd-muted", narrow ? "mt-2.5 text-xs" : "mt-3 pr-[30px] text-[13px]")}>
        {t(narrow ? "landing.deck.footnoteShort" : "landing.deck.footnote")}
      </p>
    </div>
  );
}
