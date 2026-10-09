import { forwardRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Thumb } from "./bits";
import { useCategoryLabel, useProductSuggestions } from "./useHomeData";
import type { ApiProduct } from "@/lib/api";

const browseUrl = (q: string) => (q.trim() ? `/browse?q=${encodeURIComponent(q.trim())}` : "/browse");

/** One product row in a suggestion list (shared with the mobile sheet). */
export function SuggestionRow({ p, onPick, large }: { p: ApiProduct; onPick?: () => void; large?: boolean }) {
  const label = useCategoryLabel();
  return (
    <Link
      to={`/product/${p.id}`}
      onClick={onPick}
      className={cn(
        "flex items-center gap-3 text-bd-navy hover:text-bd-navy",
        large ? "border-b border-[#f0ebe4] py-2.5" : "rounded-[9px] px-2.5 py-2 hover:bg-bd-hover focus-visible:bg-bd-hover",
      )}
    >
      <Thumb src={p.image_url} alt="" className={large ? "h-10 w-10 rounded-[9px]" : "h-[34px] w-[34px] rounded-lg"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{p.name}</span>
        <span className="text-[13px] text-bd-muted">{label(p.category)}</span>
      </span>
      {p.review_count > 0 && (
        <span className="text-sm font-semibold">
          <span className="text-bd-amber">★</span> {p.avg_rating.toFixed(1)}
        </span>
      )}
    </Link>
  );
}

/** "Not listed yet — be the first" and "See all reviews mentioning …". */
export function SuggestionFooter({ q, empty, onPick, large }: { q: string; empty: boolean; onPick?: () => void; large?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      {empty && (
        <div className={cn("text-sm text-bd-muted", large ? "py-3" : "p-2.5")}>
          {t("landing.search.noProduct")}{" "}
          <Link to="/write-review" onClick={onPick} className="font-semibold text-bd-amber-ink hover:text-bd-amber-ink">
            {t("landing.search.beFirst")}
          </Link>
        </div>
      )}
      <Link
        to={browseUrl(q)}
        onClick={onPick}
        className={cn(
          "block text-sm text-bd-ink2 hover:text-bd-amber-ink",
          large ? "py-3.5" : "mt-1.5 border-t border-[#f0ebe4] p-2.5",
        )}
      >
        {t("landing.search.seeAllBefore")}“<b>{q.trim()}</b>”{t("landing.search.seeAllAfter")} →
      </Link>
    </>
  );
}

interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  /** "hero" is the big search with a button; "compact" is the header pill. */
  variant: "hero" | "compact";
  className?: string;
}

/** Search input with a live product-suggestion dropdown (desktop). */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { value, onChange, variant, className },
  ref,
) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [focused, setFocused] = useState(false);
  const { active, products, empty } = useProductSuggestions(value, 4);
  const hero = variant === "hero";
  const open = focused && active;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFocused(false);
    navigate(browseUrl(value));
  };

  return (
    <div
      className={cn("relative", className)}
      // Keep the dropdown open while focus moves between the input and its links.
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => e.key === "Escape" && setFocused(false)}
    >
      <form
        role="search"
        onSubmit={submit}
        className={cn(
          "flex items-center bg-white transition-colors",
          hero
            ? cn(
                "gap-2.5 rounded-2xl border-[1.5px] py-2 pl-[18px] pr-2 shadow-[0_10px_30px_-12px_rgba(60,40,20,.18)]",
                focused ? "border-bd-navy" : "border-bd-line-strong",
              )
            : "gap-2 rounded-full border border-bd-line-strong px-3.5 py-2",
        )}
      >
        <Search className={cn("flex-none text-bd-muted", hero ? "h-[18px] w-[18px]" : "h-4 w-4 text-bd-faint")} aria-hidden />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(hero ? "landing.search.placeholder" : "landing.search.placeholderShort")}
          aria-label={t("landing.search.placeholder")}
          aria-expanded={open}
          autoComplete="off"
          className={cn(
            "min-w-0 flex-1 border-0 bg-transparent text-bd-navy outline-none placeholder:text-bd-faint [&::-webkit-search-cancel-button]:hidden",
            hero ? "py-2.5 text-lg" : "text-[15px]",
          )}
        />
        {hero && (
          <button
            type="submit"
            className="rounded-[11px] bg-bd-amber px-[22px] py-3 text-base font-semibold text-bd-navy transition-colors hover:bg-bd-amber-hover"
          >
            {t("landing.search.button")}
          </button>
        )}
      </form>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-[14px] border border-bd-line-strong bg-white p-2 shadow-[0_20px_40px_-16px_rgba(60,40,20,.25)]">
          {products.length > 0 && (
            <div className="px-2.5 py-1.5 font-label text-[11px] font-medium uppercase tracking-[0.06em] text-bd-faint">
              {t("common.products")}
            </div>
          )}
          {products.map((p) => (
            <SuggestionRow key={p.id} p={p} onPick={() => setFocused(false)} />
          ))}
          <SuggestionFooter q={value} empty={empty} onPick={() => setFocused(false)} />
        </div>
      )}
    </div>
  );
});
