import { useEffect, useState } from "react";
import { useQueries, useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  apiFetch,
  type ApiCategory,
  type ApiCategoryStat,
  type ApiProduct,
  type ApiReviewDetail,
  type ApiReviewListItem,
} from "@/lib/api";
import { rewardsApi } from "@/lib/rewardsApi";
import { elapsedBetween, type Elapsed } from "@/lib/reviewDeck";

const FIVE_MIN = 5 * 60 * 1000;

// Every call on this page is made by visitors who may be signed out, so none
// of them may bounce the visitor to /auth on a 401.
const pub = <T,>(path: string) => apiFetch<T>(path, {}, undefined, { redirectOn401: false });

/** True below the 640px breakpoint, where the page switches to its mobile layout. */
export function useIsNarrow() {
  const query = "(max-width: 639px)";
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

/** Locale for Intl/date formatting, following the i18n language. */
export function useLocale() {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith("bn") ? "bn-BD" : "en-US";
}

export interface PublicStats {
  reviews: number;
  timelines: number;
  members: number;
}

export function useStats() {
  return useQuery<PublicStats>({
    queryKey: ["public-stats"],
    queryFn: () => pub<PublicStats>("/stats"),
    staleTime: FIVE_MIN,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => pub<ApiCategory[]>("/categories"),
    staleTime: FIVE_MIN,
  });
}

/** Label for a category slug, from the API when known. */
export function useCategoryLabel() {
  const { data = [] } = useCategories();
  return (slug: string) =>
    data.find((c) => c.slug === slug)?.label ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Categories with their review counts. Categories with no reviews are dropped,
 * since a "0 reviews" tile is a dead end — unless that would leave none.
 */
export function useCategoryCounts() {
  const categories = useCategories();
  const { data: stats = [] } = useQuery({
    queryKey: ["category-stats"],
    queryFn: () => pub<ApiCategoryStat[]>("/categories/stats"),
    staleTime: FIVE_MIN,
  });
  const all = (categories.data ?? []).map((c) => ({
    ...c,
    count: stats.find((s) => s.category === c.slug)?.review_count ?? 0,
  }));
  const withReviews = all.filter((c) => c.count > 0);
  return {
    isLoading: categories.isLoading,
    categories: withReviews.length > 0 ? withReviews : all,
  };
}

/** The three most-reviewed products in a category, for tile thumbnails. */
export function useCategoryProducts(slug: string) {
  return useQuery({
    queryKey: ["home-category-products", slug],
    queryFn: () =>
      pub<{ data: ApiProduct[]; total: number }>(
        `/products?placement=home&category=${encodeURIComponent(slug)}&sort=review_count&limit=3`,
      ),
    staleTime: FIVE_MIN,
  });
}

/** The most-reviewed products, offered as one-tap searches. */
export function usePopularProducts() {
  const { data } = useQuery({
    queryKey: ["home-popular-products"],
    queryFn: () =>
      pub<{ data: ApiProduct[]; total: number }>("/products?placement=home&sort=review_count&limit=5"),
    staleTime: FIVE_MIN,
  });
  return (data?.data ?? []).filter((p) => p.review_count > 0);
}

export function useRecentProducts() {
  const query = useQuery({
    queryKey: ["home-recent-products"],
    queryFn: () =>
      pub<{ data: ApiProduct[]; total: number }>("/products?placement=home&sort=recent_review&limit=12"),
    staleTime: FIVE_MIN,
  });
  // A product without approved reviews has nothing to show here — unless an
  // admin pinned it, which is an explicit instruction to show it anyway.
  const products = (query.data?.data ?? []).filter(
    (p) => p.review_count > 0 || p.home_placement === "pinned",
  );
  return { isLoading: query.isLoading, products };
}

/**
 * Live product suggestions for a search box. Debounced so typing doesn't fire
 * a request per keystroke; the previous results stay up while the next load.
 */
export function useProductSuggestions(q: string, limit: number) {
  const [debounced, setDebounced] = useState(q.trim());
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 150);
    return () => clearTimeout(id);
  }, [q]);

  const enabled = debounced.length >= 2;
  const query = useQuery({
    queryKey: ["home-suggest", debounced, limit],
    queryFn: () =>
      pub<{ data: ApiProduct[]; total: number }>(
        `/products?q=${encodeURIComponent(debounced)}&limit=${limit}`,
      ),
    enabled,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
  return {
    active: enabled,
    products: enabled ? query.data?.data ?? [] : [],
    // "Nothing found" only once the answer is for what is actually typed.
    empty: enabled && !query.isFetching && (query.data?.data.length ?? 0) === 0,
  };
}

export function useLatestReviews(category: string) {
  return useQuery({
    queryKey: ["reviews", { category, sort: "latest", limit: 6 }],
    queryFn: () => {
      const params = new URLSearchParams({ sort: "latest", limit: "6" });
      if (category !== "all") params.set("category", category);
      return pub<{ data: ApiReviewListItem[]; total: number }>(`/reviews?${params}`);
    },
    placeholderData: keepPreviousData,
  });
}

export type LeaderboardRange = "week" | "month" | "all";

export function useLeaderboard(range: LeaderboardRange, limit: number) {
  const query = useQuery({
    queryKey: ["home-leaderboard", range, limit],
    queryFn: () => rewardsApi.publicLeaderboard(range, limit),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  // Production has leaderboard rows with an empty username; a nameless row
  // reads as broken, so leave those out.
  const entries = (query.data?.entries ?? []).filter((e) => e.username.trim() !== "");
  return { isLoading: query.isLoading, isError: query.isError, entries };
}

// ── Timeline reviews ─────────────────────────────────────────────────────────

export interface TimelineStep {
  rating: number;
  text: string;
  elapsed: Elapsed;
}

export interface TimelineItem {
  id: number;
  productId: number;
  productName: string;
  productImage: string;
  category: string;
  /** Display name, already resolved for imported and anonymous reviews. */
  author: string;
  anonymous: boolean;
  avatarUrl: string;
  level: string | null;
  updates: number;
  /** The original review first, then each update, oldest first. */
  steps: TimelineStep[];
}

/** Who to credit for a review: imported reviews credit their original author. */
export function reviewAuthor(r: ApiReviewListItem, anonymousLabel: string) {
  const imported = Boolean(r.source);
  return {
    name: r.is_anonymous ? anonymousLabel : imported ? r.source_author || r.author?.username || "" : r.author?.username ?? "",
    anonymous: r.is_anonymous,
    avatarUrl: r.is_anonymous || imported ? "" : r.author?.avatar_url ?? "",
    // An imported review belongs to the import bot; its level says nothing.
    level: !imported && r.author_badge?.name ? r.author_badge.name : null,
  };
}

const MAX_TIMELINES = 4;

/**
 * Recent timeline reviews with their entries, for the hero deck and the
 * "How it holds up" grid. The list endpoint carries only ratings, so the
 * entry text and dates come from each review's detail.
 */
export function useTimelineReviews() {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["home-timelines"],
    queryFn: () =>
      pub<{ data: ApiReviewListItem[]; total: number }>("/reviews?timeline_only=true&sort=latest&limit=8"),
    staleTime: FIVE_MIN,
  });

  // Prefer reviews that have come back more than once: they tell the story best.
  const picked = [...(list.data?.data ?? [])]
    .sort((a, b) => (b.timeline_updates_count ?? 0) - (a.timeline_updates_count ?? 0))
    .slice(0, MAX_TIMELINES);

  const details = useQueries({
    queries: picked.map((r) => ({
      queryKey: ["home-timeline-detail", r.id],
      queryFn: () => pub<ApiReviewDetail>(`/reviews/${r.id}`),
      staleTime: FIVE_MIN,
    })),
  });

  const items: TimelineItem[] = [];
  picked.forEach((r, i) => {
    const d = details[i]?.data;
    if (!d) return;
    const entries = [...(d.timeline ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    if (entries.length === 0) return;
    const who = reviewAuthor(r, t("review.anonymous"));
    items.push({
      id: r.id,
      productId: r.product.id,
      productName: r.product.name,
      productImage: d.product.image_url || r.images?.[0] || "",
      category: r.category,
      author: who.name,
      anonymous: who.anonymous,
      avatarUrl: who.avatarUrl,
      level: who.level,
      updates: entries.length,
      steps: [
        { rating: r.rating, text: r.excerpt, elapsed: { unit: "day1" } },
        ...entries.map((e) => ({
          rating: e.rating,
          text: e.content || e.title,
          elapsed: elapsedBetween(d.created_at, e.created_at),
        })),
      ],
    });
  });

  const loading = list.isLoading || details.some((q) => q.isLoading);
  return { isLoading: loading, items };
}

/** "6 months later" / "6 mo" for a timeline step. */
export function useElapsedLabel() {
  const { t } = useTranslation();
  return (e: Elapsed, short = false) => {
    if (e.unit === "day1") return t("landing.elapsed.day1");
    return t(`landing.elapsed.${e.unit}${short ? "Short" : "Later"}`, { count: e.n });
  };
}
