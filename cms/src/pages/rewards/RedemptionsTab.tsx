import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rewardsApi, type RewardRedemption } from "@/lib/rewardsApi";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Package, Gift } from "lucide-react";
import { toast } from "sonner";

type Filter = "" | "pending" | "approved" | "rejected" | "fulfilled";

function StatusBadge({ status }: { status: RewardRedemption["status"] }) {
  if (status === "approved")
    return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle className="h-3 w-3" />Approved</Badge>;
  if (status === "rejected")
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
  if (status === "fulfilled")
    return <Badge className="gap-1 bg-blue-100 text-blue-700 border-blue-200"><Package className="h-3 w-3" />Fulfilled</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

export function RedemptionsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("");
  const [selected, setSelected] = useState<RewardRedemption | null>(null);
  const [note, setNote] = useState("");

  const { data: redemptions = [], isLoading } = useQuery({
    queryKey: ["reward-redemptions", filter],
    queryFn: () => rewardsApi.redemptions(filter),
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) =>
      rewardsApi.resolveRedemption(id, status, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reward-redemptions"] });
      toast.success("Redemption updated");
      setSelected(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openDialog = (r: RewardRedemption) => {
    setSelected(r);
    setNote(r.admin_note || "");
  };

  const handle = (status: "approved" | "rejected") => {
    if (!selected) return;
    resolveMut.mutate({ id: selected.id, status });
  };

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap gap-2">
        {(["", "pending", "approved", "rejected", "fulfilled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {f === "" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : redemptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  <Gift className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No redemptions found.
                </TableCell>
              </TableRow>
            ) : (
              redemptions.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.user_email || `User #${r.user_id}`}</TableCell>
                  <TableCell>{r.item_name}</TableCell>
                  <TableCell>{r.points_spent}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="font-mono text-xs">{r.coupon_code || "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => openDialog(r)}>
                        Review
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review redemption</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Item</span>
                  <span className="font-medium">{selected.item_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User</span>
                  <span className="font-medium">{selected.user_email || `User #${selected.user_id}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Points spent</span>
                  <span className="font-medium">{selected.points_spent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <StatusBadge status={selected.status} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Admin note (optional)</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for approval or rejection…"
                  rows={3}
                />
              </div>
              <p className="text-xs text-muted-foreground">Rejecting refunds the points spent to the user.</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="destructive" disabled={resolveMut.isPending} onClick={() => handle("rejected")}>
              Reject
            </Button>
            <Button disabled={resolveMut.isPending} onClick={() => handle("approved")}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
