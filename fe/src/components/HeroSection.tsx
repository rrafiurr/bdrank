import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Star, Clock, Users, Search, Package, MessageSquare } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiSearchResult } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";
import { useTranslation } from "react-i18next";

const CATEGORY_CHIPS = [
  { value: "physical", labelKey: "hero.catPhysical" },
  { value: "digital", labelKey: "hero.catDigital" },
  { value: "service", labelKey: "hero.catService" },
  { value: "food", labelKey: "hero.catFood" },
];

interface PublicStats {
  reviews: number;
  timelines: number;
  members: number;
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}K+`;
  return String(n);
}

export function HeroSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiSearchResult | null>(null);
  const [focused, setFocused] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["public-stats"],
    queryFn: () => apiFetch<PublicStats>("/stats"),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<ApiSearchResult>(`/search?q=${encodeURIComponent(query.trim())}&limit=4`)
        .then(setResults)
        .catch(() => setResults(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    setFocused(false);
    navigate(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  };

  const hasSuggestions =
    results && (results.products.length > 0 || results.reviews.length > 0);
  const showDropdown = focused && query.trim().length >= 2 && results !== null;

  return (
    <section className="relative bg-gradient-hero py-5 sm:py-6 lg:py-8">
      <div className="container relative px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="mb-3 font-serif text-[28px] font-bold tracking-tight text-foreground sm:text-4xl lg:text-[40px] animate-slide-up">
            {t("hero.heading1")}{" "}
            <span className="text-gradient animate-gradient-x">{t("hero.heading2")}</span>{" "}
            {t("hero.heading3")}
          </h1>

          <p className="mb-4 text-sm text-muted-foreground sm:text-base max-w-xl mx-auto animate-slide-up animation-delay-100">
            {t("hero.subtitle")}
          </p>

          {/* Search */}
          <div id="hero-search" ref={searchBoxRef} className="relative z-40 mx-auto mb-4 max-w-xl animate-slide-up animation-delay-200">
            <form onSubmit={handleSearch} role="search">
              <div className="relative flex items-center rounded-full border border-border bg-card/90 backdrop-blur-sm shadow-elevated transition-shadow focus-within:ring-2 focus-within:ring-primary/40">
                <Search className="pointer-events-none absolute left-4 h-5 w-5 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onKeyDown={(e) => e.key === "Escape" && setFocused(false)}
                  placeholder={t("hero.searchPlaceholder")}
                  aria-label={t("hero.searchPlaceholder")}
                  className="w-full rounded-full bg-transparent py-2.5 pl-12 pr-28 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-base"
                />
                <Button type="submit" variant="hero" size="sm" className="absolute right-1.5 rounded-full px-5">
                  {t("hero.searchButton")}
                </Button>
              </div>
            </form>

            {/* Live suggestions */}
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-elevated animate-fade-in">
                {hasSuggestions ? (
                  <div className="p-1.5">
                    {results!.products.length > 0 && (
                      <>
                        <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("common.products")}
                        </p>
                        <ul>
                          {results!.products.map((p) => (
                            <li key={`p-${p.id}`}>
                              <button
                                onClick={() => { setFocused(false); navigate(`/product/${p.id}`); }}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/60"
                              >
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/10">
                                  <Package className="h-3.5 w-3.5 text-accent" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                                  <p className={`text-xs capitalize ${getCategoryDisplay(p.category).searchColor}`}>{p.category}</p>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {results!.reviews.length > 0 && (
                      <>
                        <p className="mt-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("common.reviews")}
                        </p>
                        <ul>
                          {results!.reviews.map((r) => (
                            <li key={`r-${r.id}`}>
                              <button
                                onClick={() => { setFocused(false); navigate(`/review/${r.id}`); }}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/60"
                              >
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                                  <p className={`text-xs capitalize ${getCategoryDisplay(r.category).searchColor}`}>{r.category}</p>
                                </div>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <div className="mt-1 border-t border-border px-3 py-2">
                      <button onClick={handleSearch} className="text-xs text-primary hover:underline">
                        {t("header.seeAllResults", { query })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3 text-center text-sm text-muted-foreground">
                    {t("header.noResults")} "<span className="font-medium text-foreground">{query}</span>"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Popular categories */}
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-[13px] animate-slide-up animation-delay-200">
            <span className="text-muted-foreground">{t("hero.popular")}</span>
            {CATEGORY_CHIPS.map((c) => (
              <Link
                key={c.value}
                to={`/browse?category=${c.value}`}
                className="rounded-full border border-border bg-secondary/60 px-3 py-1 text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
              >
                {t(c.labelKey)}
              </Link>
            ))}
          </div>

          {/* Live stats — one quiet line, so the section below stays in view */}
          {stats && (
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground animate-fade-in animation-delay-300">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span>
                <strong className="font-serif text-base font-bold text-foreground">
                  {fmt(stats.reviews)}
                </strong>{" "}
                {t("hero.statsReviews")}
              </span>
              <span className="text-border">·</span>
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>
                <strong className="font-serif text-base font-bold text-foreground">
                  {fmt(stats.timelines)}
                </strong>{" "}
                {t("hero.statsTimelines")}
              </span>
              <span className="text-border">·</span>
              <Users className="h-3.5 w-3.5 text-primary" />
              <span>
                <strong className="font-serif text-base font-bold text-foreground">
                  {fmt(stats.members)}
                </strong>{" "}
                {t("hero.statsMembers")}
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
