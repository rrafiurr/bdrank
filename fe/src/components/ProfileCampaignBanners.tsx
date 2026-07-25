import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { rewardsApi } from "@/lib/rewardsApi";
import { CampaignBanner } from "@/components/CampaignBanner";

/**
 * Stacked banners for every currently-running reward campaign, shown at the top
 * of the profile. Renders nothing while loading, on error, or when no campaign
 * is running — banners are promotional, not critical.
 */
export function ProfileCampaignBanners() {
  const { token } = useAuth();
  const { data } = useQuery({
    queryKey: ["rewards-campaigns"],
    queryFn: () => rewardsApi.campaigns(token),
    enabled: !!token,
  });

  const now = Date.now();
  const running = (data ?? []).filter((c) => {
    const start = new Date(c.starts_at).getTime();
    const end = new Date(c.ends_at).getTime();
    return start <= now && now <= end;
  });

  if (running.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {running.map((c) => (
        <CampaignBanner key={c.id} campaign={c} />
      ))}
    </div>
  );
}
