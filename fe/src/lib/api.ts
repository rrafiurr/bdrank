// Central API configuration — change VITE_API_BASE_URL in .env to point at your backend.
export const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

// ── Shared API types ──────────────────────────────────────────────────────────

export interface ApiCategory {
  slug: string;
  label: string;
}

export interface ApiProduct {
  id: number;
  name: string;
  category: string;
  image_url: string;
  review_count: number;
  avg_rating: number;
  created_at: string;
}

export interface ApiAuthor {
  id: number;
  username: string;
  avatar_url: string;
}

export interface ApiReviewListItem {
  id: number;
  title: string;
  excerpt: string;
  rating: number;
  category: string;
  product: { id: number; name: string };
  author: ApiAuthor;
  images: string[];
  likes_count: number;
  comments_count: number;
  is_timeline: boolean;
  timeline_updates_count?: number;
  created_at: string;
}

export interface ApiTimelineEntry {
  id: number;
  title: string;
  content: string;
  rating: number;
  image_url?: string;
  created_at: string;
}

export interface ApiComment {
  id: number;
  content: string;
  likes_count: number;
  author: ApiAuthor;
  is_owner_reply: boolean;
  company_name?: string;
  created_at: string;
}

export interface ApiReviewDetail extends Omit<ApiReviewListItem, "product"> {
  content: string;
  product: { id: number; name: string; image_url: string };
  views_count: number;
  timeline?: ApiTimelineEntry[];
  comments?: ApiComment[];
}

export interface ApiCategoryStat {
  category: string;
  review_count: number;
}

export interface ApiSearchResult {
  reviews: { id: number; title: string; category: string }[];
  products: { id: number; name: string; category: string }[];
}

export interface ApiPageListItem {
  slug: string;
  title: string;
  meta_description: string;
}

export interface ApiOwnerProduct {
  id: number;
  name: string;
  category: string;
}

export interface ApiPage extends ApiPageListItem {
  content: string;
  is_published: boolean;
  updated_at: string;
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("auth_session");
    if (!raw) return null;
    return JSON.parse(raw).token ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const resolvedToken = token !== undefined ? token : getToken();

  const headers = new Headers(options.headers);

  if (resolvedToken) {
    headers.set("Authorization", `Bearer ${resolvedToken}`);
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({ error: res.statusText }));

  if (res.status === 401) {
    localStorage.removeItem("auth_session");
    window.location.href = "/auth";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data as T;
}
