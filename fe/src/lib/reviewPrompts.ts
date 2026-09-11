// Prompt chips that scaffold the review body. Tapping one drops a heading into
// the textarea so the reviewer is never staring at an empty box — but the body
// stays a single free-text field, so a review that ignores every chip is still
// a perfectly ordinary review.

/** Prompts offered for every category, in the order they're shown. */
const BASE_PROMPTS = ["why", "good", "bad", "duration"];

/** Extra prompts appended for the four known category slugs. */
const CATEGORY_PROMPTS: Record<string, string[]> = {
  physical: ["build", "value"],
  service: ["staff", "speed"],
  digital: ["ease", "support"],
  food: ["taste", "portion"],
};

/**
 * Prompt keys for a category slug. Each key resolves to a label under the
 * `reviewForm.prompts` i18n namespace. An unknown or empty slug still gets the
 * base set, so the chips appear before a category is chosen.
 */
export function getReviewPrompts(category: string): string[] {
  return [...BASE_PROMPTS, ...(CATEGORY_PROMPTS[category] ?? [])];
}

/** The line a chip writes into the body. */
export function promptHeading(label: string): string {
  return `${label}:`;
}

/**
 * Index where `heading` starts in `text`, or -1. Only matches at the start of a
 * line so the word "Taste:" inside a sentence doesn't count as the section.
 */
export function findHeading(text: string, heading: string): number {
  if (text.startsWith(heading)) return 0;
  const i = text.indexOf(`\n${heading}`);
  return i === -1 ? -1 : i + 1;
}

/**
 * Append `heading` as a new section, returning the new body and where the caret
 * should land (the blank line under the heading, ready to type).
 */
export function appendHeading(text: string, heading: string): { text: string; caret: number } {
  const body = text.replace(/\s+$/, "");
  const next = body ? `${body}\n\n${heading}\n` : `${heading}\n`;
  return { text: next, caret: next.length };
}
