import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Star, Clock, Users, Heart, Sparkles, Search, Package, MessageSquare } from "lucide-react";
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
    <section className="relative bg-gradient-hero py-10 sm:py-12 lg:py-16">
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl animate-blob-drift" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gold/5 blur-3xl animate-blob-drift-reverse" />
      </div>

      {/* Twinkling sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <Sparkles className="absolute left-[12%] top-[18%] h-4 w-4 text-gold animate-twinkle" />
        <Sparkles className="absolute right-[15%] top-[14%] h-3 w-3 text-primary animate-twinkle-slow animation-delay-400" />
        <Sparkles className="absolute left-[22%] bottom-[20%] h-3 w-3 text-primary/70 animate-twinkle-slow animation-delay-200" />
        <Sparkles className="absolute right-[24%] bottom-[26%] h-4 w-4 text-gold/80 animate-twinkle animation-delay-300" />
        <span className="absolute left-[38%] top-[10%] h-1.5 w-1.5 rounded-full bg-gold animate-twinkle animation-delay-100" />
        <span className="absolute right-[36%] bottom-[12%] h-1.5 w-1.5 rounded-full bg-primary animate-twinkle-slow" />
      </div>

      {/* Informative floating cards (left / right) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none hidden lg:block" aria-hidden="true">
        {/* Left: sample community review */}
        <div className="absolute left-6 xl:left-16 top-1/2 -translate-y-1/2">
          <div className="w-56 xl:w-64 animate-float">
            <div className="-rotate-6 rounded-2xl border border-border bg-card/90 p-4 shadow-elevated backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-warm text-xs font-bold text-primary-foreground">
                  {t("hero.sampleName").charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{t("hero.sampleName")}</p>
                  <div className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-gold text-gold" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">“{t("hero.sampleReview")}”</p>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Heart className="h-3.5 w-3.5 fill-primary text-primary" />
                128
              </div>
            </div>
          </div>
        </div>

        {/* Right: rating-over-time timeline */}
        <div className="absolute right-6 xl:right-16 top-1/2 -translate-y-1/2">
          <div className="w-56 xl:w-64 animate-float-slow">
            <div className="rotate-6 rounded-2xl border border-border bg-card/90 p-4 shadow-elevated backdrop-blur-sm animate-pulse-glow">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">{t("hero.timelineTitle")}</span>
              </div>
              <div className="space-y-2.5 border-l-2 border-primary/20 pl-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("hero.timelineDay1")}</span>
                  <span className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-gold text-gold" />
                    ))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("hero.timelineMonth6")}</span>
                  <span className="flex">
                    {[...Array(4)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-gold text-gold" />
                    ))}
                    <Star className="h-3 w-3 text-muted" />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("hero.timelineYear1")}</span>
                  <span className="flex">
                    {[...Array(4)].map((_, i) => (
                      <Star key={i} className="h-3 w-3 fill-gold text-gold" />
                    ))}
                    <Star className="h-3 w-3 text-muted" />
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-primary">{t("hero.timelineStill")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container relative px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary animate-fade-in">
            <Star className="h-4 w-4 fill-primary animate-twinkle" />
            {t("hero.badge")}
          </div>

          <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl animate-slide-up">
            {t("hero.heading1")}{" "}
            <span className="text-gradient animate-gradient-x">{t("hero.heading2")}</span>{" "}
            {t("hero.heading3")}
          </h1>

          <p className="mb-6 text-base text-muted-foreground sm:text-lg max-w-2xl mx-auto animate-slide-up animation-delay-100">
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
                  className="w-full rounded-full bg-transparent py-3 pl-12 pr-28 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-base"
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
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-sm animate-slide-up animation-delay-200">
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

          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-slide-up animation-delay-300">
            <Link to="/write-review">
              <Button variant="hero" size="lg" className="group w-full sm:w-auto">
                {t("hero.startWriting")}
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="/browse">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                {t("hero.browseReviews")}
              </Button>
            </Link>
          </div>

          {/* Live stats */}
          {stats && (
            <div className="mt-8 lg:mt-10 grid grid-cols-3 gap-4 sm:gap-8 animate-fade-in animation-delay-300">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-primary mb-1">
                  <Star className="h-5 w-5 fill-primary" />
                  <span className="text-2xl sm:text-3xl font-bold font-serif">{fmt(stats.reviews)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("hero.statsReviews")}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-primary mb-1">
                  <Clock className="h-5 w-5" />
                  <span className="text-2xl sm:text-3xl font-bold font-serif">{fmt(stats.timelines)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("hero.statsTimelines")}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-primary mb-1">
                  <Users className="h-5 w-5" />
                  <span className="text-2xl sm:text-3xl font-bold font-serif">{fmt(stats.members)}</span>
                </div>
                <p className="text-sm text-muted-foreground">{t("hero.statsMembers")}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
