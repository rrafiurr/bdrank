import { Check, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { appendHeading, findHeading, getReviewPrompts, promptHeading } from "@/lib/reviewPrompts";
import { cn } from "@/lib/utils";

interface Props {
  /** Category slug; picks up the category-specific prompts on top of the base set. */
  category: string;
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

/**
 * Tappable chips that insert section headings into the review body.
 *
 * "Used" state is derived from the body text rather than tracked separately, so
 * it stays correct when a draft is restored or the reviewer deletes a heading
 * by hand.
 */
export function ReviewPrompts({ category, value, onChange, textareaRef }: Props) {
  const { t } = useTranslation();
  const prompts = getReviewPrompts(category);

  // Move the caret and scroll the textarea to it. Deferred a frame so React has
  // committed the new value before we address offsets inside it.
  const placeCaret = (at: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
      el.scrollTop = el.scrollHeight;
    });
  };

  const handleClick = (heading: string) => {
    const existing = findHeading(value, heading);
    if (existing !== -1) {
      // Already there — take them to it instead of writing a duplicate.
      placeCaret(existing + heading.length);
      return;
    }
    const { text, caret } = appendHeading(value, heading);
    onChange(text);
    placeCaret(caret);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("reviewForm.promptsHint")}</p>
      <div className="flex flex-wrap gap-2">
        {prompts.map((key) => {
          const label = t(`reviewForm.prompts.${key}`);
          const heading = promptHeading(label);
          const used = findHeading(value, heading) !== -1;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleClick(heading)}
              aria-pressed={used}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                used
                  ? "border-primary/30 bg-primary/5 text-primary/70"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {used ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
