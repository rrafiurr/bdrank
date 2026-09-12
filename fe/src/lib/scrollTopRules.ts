// When the floating "back to top" button is worth offering. Kept separate from
// the component so the rule can be tested without a DOM.

/** The furthest we ever make someone scroll before offering the button. */
export const SHOW_AFTER_PX = 400;

/**
 * Below this much total travel the button is not worth it: it would cover
 * content to save the reader a single flick of the wrist.
 */
export const MIN_SCROLLABLE_PX = 120;

export interface ScrollMetrics {
  /** window.scrollY */
  scrollY: number;
  /** document.documentElement.scrollHeight */
  scrollHeight: number;
  /** window.innerHeight */
  innerHeight: number;
}

/**
 * Whether to show the "back to top" button.
 *
 * The threshold scales with how far the page can actually scroll. A flat
 * `scrollY > SHOW_AFTER_PX` is only reachable on a page taller than one
 * viewport plus 400px, so on every shorter page — sign-in, the feedback form, a
 * 404 — the button could never appear no matter how far you scrolled. Halfway
 * down is a sensible offer on a short page, while anything long enough to reach
 * the full 400px still behaves exactly as it did before.
 */
export function shouldShowScrollTop({ scrollY, scrollHeight, innerHeight }: ScrollMetrics): boolean {
  const scrollable = scrollHeight - innerHeight;
  if (scrollable < MIN_SCROLLABLE_PX) return false;
  return scrollY > Math.min(SHOW_AFTER_PX, scrollable / 2);
}
