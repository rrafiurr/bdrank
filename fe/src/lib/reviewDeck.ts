// Pure rules behind the home page's timeline review deck and trail chips.
// Kept free of React and i18n so they can be tested without a DOM.

/** How long after the original review an update was written. */
export type Elapsed =
  | { unit: "day1" }
  | { unit: "days" | "months" | "years"; n: number };

const DAY_MS = 86_400_000;

/**
 * Elapsed time between the original review and a later timeline entry, in
 * the coarsest unit that is still honest: "1 year" only once a full calendar
 * year has passed, never rounded up from eleven and a half months.
 */
export function elapsedBetween(startIso: string, atIso: string): Elapsed {
  const a = new Date(startIso);
  const b = new Date(atIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) {
    return { unit: "day1" };
  }

  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months--;

  if (months >= 12) return { unit: "years", n: Math.floor(months / 12) };
  if (months >= 1) return { unit: "months", n: months };

  const days = Math.floor((b.getTime() - a.getTime()) / DAY_MS);
  return days < 1 ? { unit: "day1" } : { unit: "days", n: days };
}

/**
 * At most `max` points of a rating trail: always the original, then the most
 * recent updates. Showing the start and the end keeps the story intact when a
 * reviewer has posted more updates than the card has room for.
 */
export function trimTrail<T>(points: T[], max = 3): T[] {
  if (points.length <= max) return points;
  return [points[0], ...points.slice(points.length - (max - 1))];
}

/** Where the deck is: which card is in front and which step it is showing. */
export interface DeckState {
  card: number;
  step: number;
  paused: boolean;
}

export const DECK_TICK_MS = 2800;

/** The starting position. Reduced motion shows each card's final step, still. */
export function initialDeck(stepCounts: number[], reduceMotion: boolean): DeckState {
  if (reduceMotion && stepCounts.length > 0) {
    return { card: 0, step: Math.max(0, stepCounts[0] - 1), paused: true };
  }
  return { card: 0, step: 0, paused: reduceMotion };
}

/**
 * One autoplay tick: advance a step on the front card, and after its last
 * step bring the next card to the front at its first step.
 */
export function advanceDeck(s: DeckState, stepCounts: number[]): DeckState {
  if (s.paused || stepCounts.length === 0) return s;
  const steps = stepCounts[s.card] ?? 1;
  if (s.step < steps - 1) return { ...s, step: s.step + 1 };
  return { ...s, card: (s.card + 1) % stepCounts.length, step: 0 };
}

/** Position of card `i` in the stack: 0 is the front, then 1, 2, … behind it. */
export function stackPosition(i: number, front: number, total: number): number {
  return (i - front + total) % total;
}
