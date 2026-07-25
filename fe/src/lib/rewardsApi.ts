import { apiFetch } from "@/lib/api";

export interface RewardMe {
  points: number; lifetime_points: number;
  current_level: RewardLevel | null; next_level: RewardLevel | null; points_to_next: number;
}
export interface RewardLevel { id: number; name: string; min_points: number; icon: string; color: string; }
export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  avatar_url: string;
  level: RewardLevel | null;
  points: number;
  is_me: boolean;
}
export interface LeaderboardMe { rank: number; points: number; unranked: boolean; }
export interface LeaderboardView {
  timeframe: string;
  total: number;
  entries: LeaderboardEntry[];
  me: LeaderboardMe;
}
export interface RewardItem {
  id: number; name: string; description: string; image_url: string; points_cost: number;
  fulfillment_type: "coupon" | "manual"; effective_stock: number | null; can_afford: boolean; is_active: boolean;
}
export interface RewardGoal { id: number; name: string; threshold_points: number; reward_points: number; reward_item_id: number | null; }
export interface CampaignView {
  id: number; name: string; description: string; image_url: string; starts_at: string; ends_at: string;
  goals: RewardGoal[]; my_points: number; achieved_goal_ids: number[] | null;
  redeemed_goal_id: number | null; my_status: "active" | "redeemed" | "expired";
}
export interface RewardTx { id: number; event_type: string; points: number; note: string; created_at: string; }
export interface Redemption { id: number; item_name: string; points_spent: number; status: string; coupon_code: string; created_at: string; }

export const rewardsApi = {
  me: (t: string | null) => apiFetch<RewardMe>("/rewards/me", {}, t),
  history: (t: string | null) => apiFetch<{ data: RewardTx[] | null }>("/rewards/me/transactions", {}, t).then(r => r.data ?? []),
  levels: (t: string | null) => apiFetch<{ data: RewardLevel[] | null }>("/rewards/levels", {}, t).then(r => r.data ?? []),
  items: (t: string | null) => apiFetch<{ data: RewardItem[] | null }>("/rewards/items", {}, t).then(r => r.data ?? []),
  redeem: (t: string | null, item_id: number) => apiFetch<Redemption>("/rewards/redeem", { method: "POST", body: JSON.stringify({ item_id }) }, t),
  myRedemptions: (t: string | null) => apiFetch<{ data: Redemption[] | null }>("/rewards/me/redemptions", {}, t).then(r => r.data ?? []),
  campaigns: (t: string | null) => apiFetch<{ data: CampaignView[] | null }>("/rewards/campaigns", {}, t).then(r => r.data ?? []),
  redeemCampaign: (t: string | null, id: number, goal_id: number) =>
    apiFetch<{ item_redemption: Redemption | null }>(`/rewards/campaigns/${id}/redeem`, { method: "POST", body: JSON.stringify({ goal_id }) }, t),
  leaderboard: (t: string | null, timeframe: string, limit: number, offset: number) =>
    apiFetch<LeaderboardView>(
      `/rewards/leaderboard?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}&offset=${offset}`,
      {},
      t,
    ),
};
