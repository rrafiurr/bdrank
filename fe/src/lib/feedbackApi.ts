import { apiFetch } from "@/lib/api";

export const FEEDBACK_TYPES = ["bug", "idea", "complaint", "praise", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** The status a user sees. The server reports spam as "closed". */
export type FeedbackStatus = "new" | "in_progress" | "resolved" | "closed";

export interface FeedbackItem {
  id: number;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  /** "" when there is no reply. */
  admin_reply: string;
  replied_at: string | null;
  reply_unread: boolean;
  created_at: string;
}

export const feedbackApi = {
  create: (t: string | null, body: { type: FeedbackType; message: string; page_path?: string }) =>
    apiFetch<FeedbackItem>("/feedback", { method: "POST", body: JSON.stringify(body) }, t),
  mine: (t: string | null) =>
    apiFetch<{ data: FeedbackItem[] | null }>("/feedback/mine", {}, t).then((r) => r.data ?? []),
  // The header polls this on every page, so a stale session must never bounce
  // the visitor to sign-in from here.
  unread: (t: string | null) =>
    apiFetch<{ count: number }>("/feedback/mine/unread", {}, t, { redirectOn401: false }).then((r) => r.count),
  markSeen: (t: string | null) => apiFetch<void>("/feedback/mine/seen", { method: "POST" }, t),
};
