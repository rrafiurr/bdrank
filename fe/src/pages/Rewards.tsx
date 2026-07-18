import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LevelBadge } from "@/components/LevelBadge";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { rewardsApi, type Redemption, type RewardItem } from "@/lib/rewardsApi";
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

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["rewards-me"],
    queryFn: () => rewardsApi.me(token),
    enabled: !!token,
  });

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["rewards-history"],
    queryFn: () => rewardsApi.history(token),
    enabled: !!token,
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["rewards-items"],
    queryFn: () => rewardsApi.items(token),
    enabled: !!token,
  });

  const { data: redemptions = [], isLoading: redemptionsLoading } = useQuery({
    queryKey: ["rewards-redemptions"],
    queryFn: () => rewardsApi.myRedemptions(token),
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
            {!meLoading && me && (
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
            )}
          </CardContent>
        </Card>

        {/* ── Tabs ── */}
        <Tabs defaultValue="catalog">
          <TabsList className="mb-4 flex-wrap h-auto">
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="redemptions">My Redemptions</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>

          {/* History */}
          <TabsContent value="history">
            {historyLoading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading history…</p>
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

          {/* Campaigns — Task 23 fills this in */}
          <TabsContent value="campaigns">
            {/* Task 23 fills this in */}
            <div className="text-muted-foreground text-sm py-8 text-center">
              Campaigns are coming soon.
            </div>
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
    </div>
  );
}
