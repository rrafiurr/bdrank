// Run: npm run test:rules
// Covers the home page's timeline deck: the "6 months later" labels, how a
// long rating trail is shortened, and the autoplay step/card rotation.
import assert from "node:assert/strict";

import {
  elapsedBetween,
  trimTrail,
  initialDeck,
  advanceDeck,
  stackPosition,
} from "./reviewDeck.ts";

let pass = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`  PASS ${name}`);
    pass++;
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${(e as Error).message.split("\n")[0]}`);
    process.exitCode = 1;
  }
};

const start = "2025-01-15T10:00:00Z";

check("same day is Day 1", () =>
  assert.deepEqual(elapsedBetween(start, "2025-01-15T18:00:00Z"), { unit: "day1" }));

check("an entry dated before the review is Day 1, not negative", () =>
  assert.deepEqual(elapsedBetween(start, "2025-01-10T00:00:00Z"), { unit: "day1" }));

check("unparseable dates fall back to Day 1", () =>
  assert.deepEqual(elapsedBetween("nope", start), { unit: "day1" }));

check("under a month counts days", () =>
  assert.deepEqual(elapsedBetween(start, "2025-02-01T10:00:00Z"), { unit: "days", n: 17 }));

check("a month is not reached until the same day-of-month", () =>
  assert.deepEqual(elapsedBetween(start, "2025-02-14T10:00:00Z"), { unit: "days", n: 30 }));

check("six calendar months", () =>
  assert.deepEqual(elapsedBetween(start, "2025-07-20T10:00:00Z"), { unit: "months", n: 6 }));

check("eleven and a half months is never rounded up to a year", () =>
  assert.deepEqual(elapsedBetween(start, "2026-01-01T10:00:00Z"), { unit: "months", n: 11 }));

check("a full year", () =>
  assert.deepEqual(elapsedBetween(start, "2026-01-15T10:00:00Z"), { unit: "years", n: 1 }));

check("two years and change floors to 2", () =>
  assert.deepEqual(elapsedBetween(start, "2027-06-01T10:00:00Z"), { unit: "years", n: 2 }));

check("a short trail is untouched", () =>
  assert.deepEqual(trimTrail([5, 4, 4]), [5, 4, 4]));

check("a long trail keeps the original and the latest updates", () =>
  assert.deepEqual(trimTrail([5, 4, 3, 2, 1]), [5, 2, 1]));

check("trail max is configurable", () =>
  assert.deepEqual(trimTrail([5, 4, 3, 2, 1], 4), [5, 3, 2, 1]));

check("deck starts at the first step of the first card", () =>
  assert.deepEqual(initialDeck([3, 3], false), { card: 0, step: 0, paused: false }));

check("reduced motion starts paused on the final step", () =>
  assert.deepEqual(initialDeck([3, 2], true), { card: 0, step: 2, paused: true }));

check("reduced motion with no cards does not crash", () =>
  assert.deepEqual(initialDeck([], true), { card: 0, step: 0, paused: true }));

check("a tick advances one step", () =>
  assert.deepEqual(advanceDeck({ card: 0, step: 0, paused: false }, [3, 3]), {
    card: 0, step: 1, paused: false,
  }));

check("after the last step the next card comes to the front", () =>
  assert.deepEqual(advanceDeck({ card: 0, step: 2, paused: false }, [3, 2]), {
    card: 1, step: 0, paused: false,
  }));

check("cards with fewer steps rotate sooner", () =>
  assert.deepEqual(advanceDeck({ card: 1, step: 1, paused: false }, [3, 2]), {
    card: 0, step: 0, paused: false,
  }));

check("a paused deck does not move", () => {
  const s = { card: 1, step: 0, paused: true };
  assert.equal(advanceDeck(s, [3, 3]), s);
});

check("a single card loops back to its own first step", () =>
  assert.deepEqual(advanceDeck({ card: 0, step: 2, paused: false }, [3]), {
    card: 0, step: 0, paused: false,
  }));

check("stack position wraps behind the front card", () => {
  assert.equal(stackPosition(1, 1, 3), 0);
  assert.equal(stackPosition(2, 1, 3), 1);
  assert.equal(stackPosition(0, 1, 3), 2);
});

console.log(`\n${pass} passed`);
