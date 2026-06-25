export const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

// ── Auth types ────────────────────────────────────────────────────────────────
export interface CmsUser {
  id: number;
  email: string;
  full_name: string;
  username: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
}

// ── Admin API types ───────────────────────────────────────────────────────────
export interface AdminStats {
  total_users: number;
  total_reviews: number;
  pending_reviews: number;
  total_comments: number;
  pending_comments: number;
  total_products: number;
  total_pages: number;
  total_categories: number;
  pending_owners: number;
}

export interface AdminReview {
  id: number;
  title: string;
  rating: number;
  is_approved: boolean;
  product: string;
  author: string;
  created_at: string;
}

export interface AdminComment {
  id: number;
  content: string;
  is_approved: boolean;
  review_id: number;
  review_title: string;
  author: string;
  created_at: string;
}

export interface AdminProduct {
  id: number;
  name: string;
  category: string;
  image_url: string;
  review_count: number;
  avg_rating: number;
  created_at: string;
}

export interface AdminCategory {
  slug: string;
  label: string;
}

export interface AdminPage {
  slug: string;
  title: string;
  meta_description: string;
  content?: string;
  is_published: boolean;
  updated_at: string;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────
function getToken(): string | null {
  try {
    const raw = localStorage.getItem("cms_session");
    if (!raw) return null;
    return JSON.parse(raw).token ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({ error: res.statusText }));
  if (res.status === 401) {
    localStorage.removeItem("cms_session");
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}
