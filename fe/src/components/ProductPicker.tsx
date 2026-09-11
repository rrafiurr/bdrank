import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Loader2, Star, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch, type ApiProduct } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";

interface Props {
  /** The typed name. Owned by the form so a restored draft can seed it. */
  value: string;
  onValueChange: (name: string) => void;
  selected: ApiProduct | null;
  /** Fires with the chosen product, or null when the selection is cleared. */
  onSelect: (product: ApiProduct | null) => void;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * Product name field with autocomplete over existing products. Typing a name
 * that matches nothing is valid — the review then creates a new product, which
 * is why the field never forces a selection.
 */
export function ProductPicker({ value, onValueChange, selected, onSelect, invalid, describedBy }: Props) {
  const { t } = useTranslation();
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const { data, isFetching } = useQuery({
    queryKey: ["product-search", debouncedQuery],
    queryFn: () =>
      apiFetch<{ data: ApiProduct[]; total: number }>(
        `/products?q=${encodeURIComponent(debouncedQuery)}&limit=6`
      ),
    enabled: debouncedQuery.length >= 2 && !selected,
  });

  // Memoised so the dropdown effect below keys off actual results rather
  // than a fresh empty array on every render.
  const suggestions = useMemo(() => data?.data ?? [], [data]);

  useEffect(() => {
    setShowDropdown(!selected && suggestions.length > 0 && debouncedQuery.length >= 2);
    setFocusedIndex(-1);
  }, [suggestions, selected, debouncedQuery]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(e.target.value);
    // Typing again means they're no longer describing the locked-in product.
    if (selected) onSelect(null);
  };

  const handleSelect = (p: ApiProduct) => {
    onValueChange(p.name);
    onSelect(p);
    setShowDropdown(false);
  };

  const clearSelection = () => {
    onValueChange("");
    onSelect(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && focusedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[focusedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setFocusedIndex(-1);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Input
          id="product"
          placeholder={t("reviewForm.productPlaceholder")}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!selected && suggestions.length > 0) setShowDropdown(true);
          }}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`bg-background pr-8 ${
            invalid
              ? "border-destructive focus-visible:ring-destructive"
              : selected
                ? "border-primary ring-1 ring-primary/20"
                : ""
          }`}
          autoComplete="off"
        />
        {isFetching && !selected && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        {selected && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive transition-colors"
            title={t("reviewForm.clearSelection")}
            aria-label={t("reviewForm.clearSelection")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {selected && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-primary">{t("reviewForm.existingSelected")}</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {selected.review_count > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {selected.avg_rating.toFixed(1)}
                <span className="text-border/70">·</span>
                {t("reviewForm.review", { count: selected.review_count })}
              </span>
            )}
          </div>
        </div>
      )}

      {showDropdown && (
        <div className="absolute z-50 top-full mt-1.5 w-full bg-card border border-border rounded-xl shadow-elevated overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
            <span className="text-xs font-medium text-muted-foreground">
              {t("reviewForm.existingProducts", { count: suggestions.length })}
            </span>
            <span className="text-xs text-muted-foreground hidden sm:block">{t("reviewForm.navigateHint")}</span>
          </div>

          {suggestions.map((p, idx) => {
            const { icon: Icon, badgeVariant } = getCategoryDisplay(p.category);
            const isHighlighted = focusedIndex === idx;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/40 last:border-b-0 group ${
                  isHighlighted ? "bg-accent" : "hover:bg-accent/60"
                }`}
              >
                <div className="h-11 w-11 rounded-lg overflow-hidden flex-shrink-0 bg-muted border border-border flex items-center justify-center">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate leading-snug">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={badgeVariant} className="text-[10px] px-1.5 h-4 py-0">
                      {p.category}
                    </Badge>
                    {p.review_count > 0 ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {p.avg_rating.toFixed(1)}
                        <span className="text-border">·</span>
                        {t("reviewForm.review", { count: p.review_count })}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">{t("reviewForm.noReviewsYet")}</span>
                    )}
                  </div>
                </div>

                <span
                  className={`flex items-center gap-0.5 text-xs font-medium text-primary flex-shrink-0 transition-opacity ${
                    isHighlighted ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {t("reviewForm.select")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}

          <div className="px-3 py-2 bg-muted/30 border-t border-border">
            <p className="text-[11px] text-muted-foreground">{t("reviewForm.notWhatYouNeed")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
