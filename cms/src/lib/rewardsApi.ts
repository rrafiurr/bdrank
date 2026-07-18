import { apiFetch } from "@/lib/api";

export interface RewardRule {
  id: number; event_type: string; points: number;
  daily_cap: number | null; lifetime_cap: number | null; is_active: boolean; updated_at: string;
}
export interface RewardLevel {
  id: number; name: string; min_points: number; icon: string; color: string; is_active: boolean;
}
export interface RewardItem {
  id: number; name: string; description: string; image_url: string; points_cost: number;
  fulfillment_type: "coupon" | "manual"; stock: number | null; is_active: boolean; effective_stock?: number | null;
}
export interface RewardRedemption {
  id: number; user_id: number; user_email?: string; item_name: string; points_spent: number;
  status: "pending" | "approved" | "rejected" | "fulfilled"; coupon_code: string; admin_note: string;
  created_at: string; resolved_at: string | null;
}
export interface RewardGoal {
  id: number; campaign_id: number; name: string; threshold_points: number; sort_order: number;
  reward_points: number; reward_item_id: number | null;
}
export interface RewardCampaign {
  id: number; name: string; description: string; image_url: string;
  starts_at: string; ends_at: string; is_active: boolean; created_at: string; goals?: RewardGoal[];
}
export interface CampaignParticipant {
  campaign_id: number; user_id: number; email: string;
  redeemed_goal_id: number | null; status: string; redeemed_at: string | null;
}

const list = <T,>(p: string) => apiFetch<{ data: T[] | null }>(p).then((r) => r.data ?? []);

export const rewardsApi = {
  rules: () => list<RewardRule>("/admin/rewards/rules"),
  createRule: (b: Partial<RewardRule>) => apiFetch("/admin/rewards/rules", { method: "POST", body: JSON.stringify(b) }),
  updateRule: (id: number, b: Partial<RewardRule>) => apiFetch(`/admin/rewards/rules/${id}`, { method: "PUT", body: JSON.stringify(b) }),

  levels: () => list<RewardLevel>("/admin/rewards/levels"),
  createLevel: (b: Partial<RewardLevel>) => apiFetch("/admin/rewards/levels", { method: "POST", body: JSON.stringify(b) }),
  updateLevel: (id: number, b: Partial<RewardLevel>) => apiFetch(`/admin/rewards/levels/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteLevel: (id: number) => apiFetch(`/admin/rewards/levels/${id}`, { method: "DELETE" }),

  items: () => list<RewardItem>("/admin/rewards/items"),
  createItem: (b: Partial<RewardItem>) => apiFetch("/admin/rewards/items", { method: "POST", body: JSON.stringify(b) }),
  updateItem: (id: number, b: Partial<RewardItem>) => apiFetch(`/admin/rewards/items/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteItem: (id: number) => apiFetch(`/admin/rewards/items/${id}`, { method: "DELETE" }),
  addCodes: (id: number, codes: string) => apiFetch(`/admin/rewards/items/${id}/codes`, { method: "POST", body: JSON.stringify({ codes }) }),

  redemptions: (status = "") => list<RewardRedemption>(`/admin/rewards/redemptions${status ? `?status=${status}` : ""}`),
  resolveRedemption: (id: number, status: string, admin_note: string) =>
    apiFetch(`/admin/rewards/redemptions/${id}`, { method: "PUT", body: JSON.stringify({ status, admin_note }) }),

  campaigns: () => list<RewardCampaign>("/admin/rewards/campaigns"),
  campaign: (id: number) => apiFetch<RewardCampaign>(`/admin/rewards/campaigns/${id}`),
  createCampaign: (b: Partial<RewardCampaign>) => apiFetch("/admin/rewards/campaigns", { method: "POST", body: JSON.stringify(b) }),
  updateCampaign: (id: number, b: Partial<RewardCampaign>) => apiFetch(`/admin/rewards/campaigns/${id}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteCampaign: (id: number) => apiFetch(`/admin/rewards/campaigns/${id}`, { method: "DELETE" }),
  createGoal: (cid: number, b: Partial<RewardGoal>) => apiFetch(`/admin/rewards/campaigns/${cid}/goals`, { method: "POST", body: JSON.stringify(b) }),
  updateGoal: (cid: number, gid: number, b: Partial<RewardGoal>) => apiFetch(`/admin/rewards/campaigns/${cid}/goals/${gid}`, { method: "PUT", body: JSON.stringify(b) }),
  deleteGoal: (cid: number, gid: number) => apiFetch(`/admin/rewards/campaigns/${cid}/goals/${gid}`, { method: "DELETE" }),
  participants: (id: number) => list<CampaignParticipant>(`/admin/rewards/campaigns/${id}/participants`),
};
