// Run: npm run test:rules
// Covers the visibility rule for the "back to top" button. The bug being fixed:
// a flat `scrollY > 400` gate meant any page shorter than one viewport + 400px
// never offered the button, so it was missing from every short page.
import assert from "node:assert/strict";

import {
  shouldShowScrollTop,
  SHOW_AFTER_PX,
  MIN_SCROLLABLE_PX,
} from "./scrollTopRules.ts";

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

// A tall page: the long-standing behaviour must not change.
const tall = { scrollHeight: 5000, innerHeight: 800 };

check("tall page stays hidden at the top", () =>
  assert.equal(shouldShowScrollTop({ ...tall, scrollY: 0 }), false));

check("tall page stays hidden just under the full threshold", () =>
  assert.equal(shouldShowScrollTop({ ...tall, scrollY: SHOW_AFTER_PX - 1 }), false));

check("tall page shows past the full threshold", () =>
  assert.equal(shouldShowScrollTop({ ...tall, scrollY: SHOW_AFTER_PX + 1 }), true));

// The regression: a page that scrolls, but by less than SHOW_AFTER_PX.
// 1000 - 800 = 200px of travel, so the old rule could never fire.
const shortScrollable = { scrollHeight: 1000, innerHeight: 800 };

check("short scrollable page eventually shows the button", () =>
  assert.equal(shouldShowScrollTop({ ...shortScrollable, scrollY: 150 }), true));

check("short scrollable page is hidden at the very top", () =>
  assert.equal(shouldShowScrollTop({ ...shortScrollable, scrollY: 0 }), false));

check("short scrollable page shows by the time you reach the bottom", () =>
  assert.equal(shouldShowScrollTop({ ...shortScrollable, scrollY: 200 }), true));

// A page that does not scroll at all has nothing to go back to.
check("unscrollable page never shows the button", () =>
  assert.equal(shouldShowScrollTop({ scrollHeight: 800, innerHeight: 800, scrollY: 0 }), false));

check("page shorter than the viewport never shows the button", () =>
  assert.equal(shouldShowScrollTop({ scrollHeight: 500, innerHeight: 800, scrollY: 0 }), false));

// A trivial amount of travel is not worth covering content for.
check("barely-scrollable page stays hidden even when scrolled", () =>
  assert.equal(
    shouldShowScrollTop({
      scrollHeight: 800 + MIN_SCROLLABLE_PX - 1,
      innerHeight: 800,
      scrollY: MIN_SCROLLABLE_PX,
    }),
    false,
  ));

check("page at exactly the minimum travel can show", () =>
  assert.equal(
    shouldShowScrollTop({
      scrollHeight: 800 + MIN_SCROLLABLE_PX,
      innerHeight: 800,
      scrollY: MIN_SCROLLABLE_PX,
    }),
    true,
  ));

// Guard against nonsense input from a mid-layout read.
check("negative scrollY is hidden", () =>
  assert.equal(shouldShowScrollTop({ ...tall, scrollY: -50 }), false));

check("zero innerHeight does not throw", () =>
  assert.doesNotThrow(() =>
    shouldShowScrollTop({ scrollHeight: 0, innerHeight: 0, scrollY: 0 })));

console.log(`\n${pass} passed${process.exitCode ? ", some FAILED" : ""}`);
