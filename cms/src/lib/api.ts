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
  pending_embeds: number;
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

export interface AdminReviewDetail extends AdminReview {
  content: string;
  images: string[];
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

export interface AdminReviewField {
  id: number;
  field_key: string;
  label: string;
  type: "text" | "url" | "select" | "number";
  is_required: boolean;
  options: string[];
  min_value: number | null;
  max_value: number | null;
  help_text: string;
  sort_order: number;
  is_active: boolean;
}

export interface AdminPage {
  slug: string;
  title: string;
  meta_description: string;
  content?: string;
  is_published: boolean;
  updated_at: string;
}

export interface AdminPageDetail extends AdminPage {
  content: string;
}

// Public site base URL — used for "view page" links out of the CMS
export const SITE_URL = import.meta.env.VITE_SITE_URL ?? "http://localhost:5173";

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

export interface AdminImage {
  filename: string;
  url: string;
  size: number;
  modified: string;
  /** null when no review_images row points at this file. */
  review_id: number | null;
  review_title?: string;
}

/** A row outside review_images that still points at a file, returned on a 409. */
export interface ImageUse {
  table: string;
  label: string;
}

/**
 * An HTTP error carrying the response body. Some endpoints answer a failure
 * with structured detail — a 409 from the image manager lists the rows still
 * using the file — and that detail is lost if only the message survives.
 * Extends Error, so existing `e instanceof Error` handling is unaffected.
 */
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
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

  if (!res.ok) throw new ApiError(data.error ?? "Request failed", res.status, data);
  return data as T;
}

export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const data = await apiFetch<{ url: string }>("/admin/upload/image", {
    method: "POST",
    body: fd,
  });
  return data.url;
}
