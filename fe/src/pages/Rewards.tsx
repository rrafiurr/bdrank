import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LevelBadge } from "@/components/LevelBadge";
import { LeaderboardTab } from "@/pages/rewards/LeaderboardTab";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { rewardsApi, type CampaignView, type Redemption, type RewardGoal, type RewardItem } from "@/lib/rewardsApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "fulfilled":
    case "approved":
      return "default";
    case "pending":
      return "secondary";
    case "rejected":
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

export default function Rewards() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmItem, setConfirmItem] = useState<RewardItem | null>(null);
  const [successRedemption, setSuccessRedemption] = useState<Redemption | null>(null);

  const [confirmCampaignGoal, setConfirmCampaignGoal] = useState<{ campaign: CampaignView; goal: RewardGoal } | null>(
    null,
  );
  const [campaignRedeemResult, setCampaignRedeemResult] = useState<{
    goal: RewardGoal;
    item_redemption: Redemption | null;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const {
    data: me,
    isLoading: meLoading,
    isError: meError,
    refetch: refetchMe,
  } = useQuery({
    queryKey: ["rewards-me"],
    queryFn: () => rewardsApi.me(token),
    enabled: !!token,
  });

  const {
    data: history = [],
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ["rewards-history"],
    queryFn: () => rewardsApi.history(token),
    enabled: !!token,
  });

  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ["rewards-items"],
    queryFn: () => rewardsApi.items(token),
    enabled: !!token,
  });

  const {
    data: redemptions = [],
    isLoading: redemptionsLoading,
    isError: redemptionsError,
    refetch: refetchRedemptions,
  } = useQuery({
    queryKey: ["rewards-redemptions"],
    queryFn: () => rewardsApi.myRedemptions(token),
    enabled: !!token,
  });

  const {
    data: campaigns = [],
    isLoading: campaignsLoading,
    isError: campaignsError,
    refetch: refetchCampaigns,
  } = useQuery({
    queryKey: ["rewards-campaigns"],
    queryFn: () => rewardsApi.campaigns(token),
    enabled: !!token,
  });

  const redeemMutation = useMutation({
    mutationFn: (itemId: number) => rewardsApi.redeem(token, itemId),
    onSuccess: (redemption) => {
      queryClient.invalidateQueries({ queryKey: ["rewards-me"] });
      queryClient.invalidateQueries({ queryKey: ["rewards-items"] });
      queryClient.invalidateQueries({ queryKey: ["rewards-redemptions"] });
      setConfirmItem(null);
      toast({ title: "Redeemed!", description: `You redeemed ${redemption.item_name}.` });
      if (redemption.coupon_code) {
        setSuccessRedemption(redemption);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Redemption failed",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const redeemCampaignMutation = useMutation({
    mutationFn: ({ campaign, goal }: { campaign: CampaignView; goal: RewardGoal }) =>
      rewardsApi.redeemCampaign(token, campaign.id, goal.id),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["rewards-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["rewards-me"] });
      setConfirmCampaignGoal(null);
      toast({ title: "Redeemed!", description: `You redeemed the "${variables.goal.name}" reward.` });
      setCampaignRedeemResult({ goal: variables.goal, item_redemption: result.item_redemption });
    },
    onError: (error: any) => {
      toast({
        title: "Redemption failed",
        description: error?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Please log in to view your rewards.</p>
            <Button asChild variant="hero">
              <Link to="/auth">Log in</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const progressPct =
    me?.next_level && me.next_level.min_points > 0
      ? Math.min(100, Math.round(((me.lifetime_points ?? 0) / me.next_level.min_points) * 100))
      : null;

  return (
    <div className="min-h-screen bg-background">
      <PageHead title="Rewards" noindex />
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground">Rewards</h1>
          <p className="text-muted-foreground mt-2">Earn points, level up, and redeem rewards.</p>
        </div>

        {/* ── Balance card ── */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 flex-wrap">
              {meLoading ? (
                <span className="text-muted-foreground text-base font-normal">Loading balance…</span>
              ) : meError ? (
                <span className="text-muted-foreground text-base font-normal">Couldn't load your rewards balance.</span>
              ) : (
                <>
                  <span>{me?.points ?? 0} points</span>
                  {me?.current_level && (
                    <LevelBadge
                      name={me.current_level.name}
                      icon={me.current_level.icon}
                      color={me.current_level.color}
                    />
                  )}
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {meError ? (
              <Button variant="outline" size="sm" onClick={() => refetchMe()}>
                Retry
              </Button>
            ) : (
              !meLoading &&
              me && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Lifetime points: <span className="font-medium text-foreground">{me.lifetime_points}</span>
                  </p>
                  {me.next_level && progressPct !== null ? (
                    <div className="space-y-1.5">
                      <Progress value={progressPct} />
                      <p className="text-xs text-muted-foreground">
                        {Math.max(0, me.next_level.min_points - me.lifetime_points)} points to {me.next_level.name}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">You've reached the highest level.</p>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* ── Tabs ── */}
        <Tabs defaultValue="catalog">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="redemptions">My Redemptions</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>

          {/* History */}
          <TabsContent value="history">
            {historyLoading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading history…</p>
            ) : historyError ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground text-sm">Couldn't load your point history.</p>
                <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                  Retry
                </Button>
              </div>
            ) : history.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No point activity yet.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <ul className="divide-y divide-border">
                  {history.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground capitalize">
                          {tx.event_type.replace(/_/g, " ")}
                        </p>
                        {tx.note && <p className="text-xs text-muted-foreground truncate">{tx.note}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold flex-shrink-0 ${
                          tx.points >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {tx.points >= 0 ? "+" : ""}
                        {tx.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Catalog */}
          <TabsContent value="catalog">
            {itemsLoading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading catalog…</p>
            ) : itemsError ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground text-sm">Couldn't load the reward catalog.</p>
                <Button variant="outline" size="sm" onClick={() => refetchItems()}>
                  Retry
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No reward items available right now.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => {
                  const inStock = item.effective_stock === null || item.effective_stock > 0;
                  const stockLabel =
                    item.effective_stock === null
                      ? "Unlimited"
                      : item.effective_stock > 0
                        ? `${item.effective_stock} left`
                        : "Out of stock";
                  return (
                    <Card key={item.id} className="flex flex-col">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-full h-32 object-cover rounded-t-lg"
                        />
                      )}
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{item.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground flex-1">{item.description}</p>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-foreground">{item.points_cost} pts</span>
                          <span className="text-xs text-muted-foreground">{stockLabel}</span>
                        </div>
                        <Button
                          variant="hero"
                          size="sm"
                          className="w-full"
                          disabled={!item.can_afford || !inStock}
                          onClick={() => setConfirmItem(item)}
                        >
                          {!inStock ? "Out of stock" : !item.can_afford ? "Not enough points" : "Redeem"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* My Redemptions */}
          <TabsContent value="redemptions">
            {redemptionsLoading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading redemptions…</p>
            ) : redemptionsError ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground text-sm">Couldn't load your redemptions.</p>
                <Button variant="outline" size="sm" onClick={() => refetchRedemptions()}>
                  Retry
                </Button>
              </div>
            ) : redemptions.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">You haven't redeemed anything yet.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <ul className="divide-y divide-border">
                  {redemptions.map((r) => (
                    <li key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{r.item_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.points_spent} pts · {new Date(r.created_at).toLocaleDateString()}
                        </p>
                        {r.coupon_code && (
                          <p className="text-xs font-mono text-foreground mt-1">Code: {r.coupon_code}</p>
                        )}
                      </div>
                      <Badge variant={statusVariant(r.status)} className="flex-shrink-0 capitalize">
                        {r.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Campaigns */}
          <TabsContent value="campaigns">
            {campaignsLoading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading campaigns…</p>
            ) : campaignsError ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-muted-foreground text-sm">Couldn't load campaigns.</p>
                <Button variant="outline" size="sm" onClick={() => refetchCampaigns()}>
                  Retry
                </Button>
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No active campaigns right now.</p>
            ) : (
              <div className="space-y-6">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onRedeemClick={(goal) => setConfirmCampaignGoal({ campaign, goal })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="leaderboard">
            <LeaderboardTab />
          </TabsContent>
        </Tabs>
      </main>

      <Footer />

      {/* Redeem confirmation dialog */}
      <Dialog open={!!confirmItem} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem {confirmItem?.name}?</DialogTitle>
            <DialogDescription>
              This will cost {confirmItem?.points_cost} points. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmItem(null)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={redeemMutation.isPending}
              onClick={() => confirmItem && redeemMutation.mutate(confirmItem.id)}
            >
              {redeemMutation.isPending ? "Redeeming…" : "Confirm redeem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success dialog with coupon code */}
      <Dialog open={!!successRedemption} onOpenChange={(open) => !open && setSuccessRedemption(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redemption successful</DialogTitle>
            <DialogDescription>
              You redeemed {successRedemption?.item_name}. Here's your code:
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-lg px-4 py-3 text-center font-mono text-lg font-semibold tracking-wider">
            {successRedemption?.coupon_code}
          </div>
          <DialogFooter>
            <Button variant="hero" onClick={() => setSuccessRedemption(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign goal redeem confirmation dialog */}
      <Dialog open={!!confirmCampaignGoal} onOpenChange={(open) => !open && setConfirmCampaignGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem "{confirmCampaignGoal?.goal.name}"?</DialogTitle>
            <DialogDescription>
              This ends your participation in this campaign and forfeits higher goals. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCampaignGoal(null)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              disabled={redeemCampaignMutation.isPending}
              onClick={() => confirmCampaignGoal && redeemCampaignMutation.mutate(confirmCampaignGoal)}
            >
              {redeemCampaignMutation.isPending ? "Redeeming…" : "Confirm redeem"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign redeem success dialog */}
      <Dialog open={!!campaignRedeemResult} onOpenChange={(open) => !open && setCampaignRedeemResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redemption successful</DialogTitle>
            <DialogDescription>
              You redeemed "{campaignRedeemResult?.goal.name}"
              {campaignRedeemResult?.goal.reward_points ? ` for ${campaignRedeemResult.goal.reward_points} points` : ""}
              {campaignRedeemResult?.item_redemption ? ` and ${campaignRedeemResult.item_redemption.item_name}` : ""}.
            </DialogDescription>
          </DialogHeader>
          {campaignRedeemResult?.item_redemption?.coupon_code && (
            <div className="bg-muted rounded-lg px-4 py-3 text-center font-mono text-lg font-semibold tracking-wider">
              {campaignRedeemResult.item_redemption.coupon_code}
            </div>
          )}
          <DialogFooter>
            <Button variant="hero" onClick={() => setCampaignRedeemResult(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function campaignEndLabel(campaign: CampaignView): string {
  const ends = new Date(campaign.ends_at);
  const dateLabel = ends.toLocaleDateString();
  if (campaign.my_status === "expired") return `Ended ${dateLabel}`;
  const msLeft = ends.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return `Ends ${dateLabel}`;
  if (daysLeft === 1) return `Ends ${dateLabel} (1 day left)`;
  return `Ends ${dateLabel} (${daysLeft} days left)`;
}

function goalRewardLabel(goal: RewardGoal): string {
  const parts: string[] = [];
  if (goal.reward_points) parts.push(`${goal.reward_points} pts`);
  if (goal.reward_item_id) parts.push("an item");
  return parts.length > 0 ? parts.join(" + ") : "—";
}

function CampaignCard({
  campaign,
  onRedeemClick,
}: {
  campaign: CampaignView;
  onRedeemClick: (goal: RewardGoal) => void;
}) {
  // Goal ids are globally unique (auto-increment PK across all campaigns' goals),
  // so tracking by goal.id alone is safe even though this state is scoped per card.
  const [continuedGoals, setContinuedGoals] = useState<Set<number>>(new Set());
  const achievedIds = new Set(campaign.achieved_goal_ids ?? []);
  const sortedGoals = [...campaign.goals].sort((a, b) => a.threshold_points - b.threshold_points);
  const nextGoal = sortedGoals.find((g) => !achievedIds.has(g.id));
  const progressPct = nextGoal
    ? Math.min(100, Math.round((campaign.my_points / Math.max(1, nextGoal.threshold_points)) * 100))
    : 100;
  const redeemedGoal = sortedGoals.find((g) => g.id === campaign.redeemed_goal_id);

  return (
    <Card className="overflow-hidden">
      {campaign.image_url && (
        <img src={campaign.image_url} alt={campaign.name} className="w-full h-40 object-cover" />
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">{campaign.name}</CardTitle>
          <div className="flex items-center gap-2 flex-shrink-0">
            {campaign.my_status === "expired" && <Badge variant="destructive">Expired</Badge>}
            {campaign.my_status === "redeemed" && <Badge>Redeemed</Badge>}
            <span className="text-xs text-muted-foreground whitespace-nowrap">{campaignEndLabel(campaign)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {campaign.description && <p className="text-sm text-muted-foreground">{campaign.description}</p>}

        <p className="text-sm">
          Your points in this campaign: <span className="font-semibold text-foreground">{campaign.my_points}</span>
        </p>

        {campaign.my_status === "redeemed" && (
          <p className="text-sm text-muted-foreground">
            You redeemed <span className="font-medium text-foreground">{redeemedGoal?.name ?? "a reward"}</span> in
            this campaign. Your participation has ended.
          </p>
        )}

        {campaign.my_status === "expired" && (
          <p className="text-sm text-muted-foreground">This campaign has ended.</p>
        )}

        {nextGoal && (
          <div className="space-y-1.5">
            <Progress value={progressPct} />
            <p className="text-xs text-muted-foreground">
              {Math.max(0, nextGoal.threshold_points - campaign.my_points)} points to "{nextGoal.name}"
            </p>
          </div>
        )}

        {/* Goal ladder */}
        <ul className="space-y-2">
          {sortedGoals.map((goal) => {
            const achieved = achievedIds.has(goal.id);
            const isRedeemedGoal = goal.id === campaign.redeemed_goal_id;
            const canRedeem = achieved && !isRedeemedGoal && campaign.my_status === "active";
            return (
              <li
                key={goal.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 flex-wrap",
                  achieved ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full border",
                      achieved ? "bg-primary border-primary text-primary-foreground" : "border-border text-transparent",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{goal.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {goal.threshold_points} pts threshold · Reward: {goalRewardLabel(goal)}
                    </p>
                  </div>
                  {isRedeemedGoal && (
                    <Badge variant="secondary" className="flex-shrink-0">
                      Redeemed
                    </Badge>
                  )}
                </div>
                {canRedeem &&
                  (continuedGoals.has(goal.id) ? (
                    <p className="text-xs text-muted-foreground flex-shrink-0">
                      Keep earning toward the next goal — you can still redeem this later.
                    </p>
                  ) : (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setContinuedGoals((prev) => {
                            const next = new Set(prev);
                            next.add(goal.id);
                            return next;
                          })
                        }
                      >
                        Continue
                      </Button>
                      <Button size="sm" variant="hero" onClick={() => onRedeemClick(goal)}>
                        Redeem
                      </Button>
                    </div>
                  ))}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
