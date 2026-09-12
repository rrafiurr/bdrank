// Mirrors be/internal/feedback/feedback.go so most mistakes are caught while
// typing. The server re-checks everything and has the final say, so keep
// these numbers in step with it.

export const FEEDBACK_MIN = 20;
export const FEEDBACK_MAX = 2000;
export const FEEDBACK_MAX_LINKS = 2;
export const FEEDBACK_MAX_OPEN = 10;
const MIN_DISTINCT = 6;

// Where a link starts. A "www." that begins exactly where a matched http:// or
// https:// ended is that link's host, so countLinks skips it: "https://www.x.com"
// is one link, while links joined by commas still count separately. Mirrors
// countLinks in be/internal/feedback/feedback.go. No regex lookbehind on
// purpose: it is a syntax error on iOS Safari before 16.4 and would break the page.
const LINK_START = /https?:\/\/|www\./gi;

/** How many links s contains, counted the way the server counts them. */
export function countLinks(s: string): number {
  let n = 0;
  let schemeEnd = -1; // end of the last matched http:// or https://
  for (const m of s.matchAll(LINK_START)) {
    const start = m.index ?? 0;
    if (m[0].length === 4) {
      // "www."
      if (start === schemeEnd) continue;
    } else {
      schemeEnd = start + m[0].length;
    }
    n++;
  }
  return n;
}

export type FeedbackRuleCode =
  | "message_too_short"
  | "message_too_long"
  | "message_low_effort"
  | "too_many_links";

/** Characters as the server counts them: code points, not UTF-16 units. */
export const charCount = (s: string) => [...s.trim()].length;

export function checkFeedbackMessage(message: string): FeedbackRuleCode | null {
  const m = message.trim();
  const n = [...m].length;
  if (n < FEEDBACK_MIN) return "message_too_short";
  if (n > FEEDBACK_MAX) return "message_too_long";
  if (new Set([...m].filter((ch) => !/\s/.test(ch))).size < MIN_DISTINCT) return "message_low_effort";
  if (countLinks(m) > FEEDBACK_MAX_LINKS) return "too_many_links";
  return null;
}
