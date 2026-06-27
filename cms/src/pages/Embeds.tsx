import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, Code2 } from "lucide-react";
import { toast } from "sonner";

interface AdminEmbed {
  id: number;
  token: string;
  product_id: number;
  product_name: string;
  owner_email: string;
  owner_company: string;
  domain: string;
  status: "pending" | "approved" | "revoked";
  show_rating: boolean;
  show_count: boolean;
  show_breakdown: boolean;
  show_snippet: boolean;
  admin_note: string;
  created_at: string;
  approved_at?: string;
}

function StatusBadge({ status }: { status: AdminEmbed["status"] }) {
  if (status === "approved")
    return <Badge className="gap-1 bg-green-100 text-green-700 border-green-200"><CheckCircle className="h-3 w-3" />Approved</Badge>;
  if (status === "revoked")
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Revoked</Badge>;
  return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
}

export default function Embeds() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"" | "pending" | "approved" | "revoked">("");
  const [selected, setSelected] = useState<AdminEmbed | null>(null);
  const [note, setNote] = useState("");

  const { data: embeds = [], isLoading } = useQuery<AdminEmbed[]>({
    queryKey: ["admin-embeds", filter],
    queryFn: () => {
      const qs = filter ? `?status=${filter}` : "";
      return apiFetch<AdminEmbed[]>(`/admin/embeds${qs}`);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/admin/embeds/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, admin_note: note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-embeds"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Embed token updated");
      setSelected(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openDialog = (embed: AdminEmbed) => {
    setSelected(embed);
    setNote(embed.admin_note || "");
  };

  const handle = (status: "approved" | "revoked") => {
    if (!selected) return;
    updateMut.mutate({ id: selected.id, status });
  };

  const pending = embeds.filter((e) => e.status === "pending").length;

  return (
    <Layout title="Embed Codes">
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          <span>{pending} embed request{pending !== 1 ? "s" : ""} awaiting approval</span>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {(["", "pending", "approved", "revoked"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {f === "" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : embeds.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Code2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No embed codes found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          {embeds.map((embed, i) => (
            <div
              key={embed.id}
              className={`flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors ${
                i < embeds.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm text-foreground">{embed.product_name}</span>
                  <StatusBadge status={embed.status} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span>{embed.domain}</span>
                  <span>·</span>
                  <span>{embed.owner_company || embed.owner_email}</span>
                  <span>·</span>
                  <span>{new Date(embed.created_at).toLocaleDateString()}</span>
                </div>
                {embed.admin_note && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">{embed.admin_note}</p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                {embed.show_rating && <span className="rounded bg-muted px-1.5 py-0.5">Rating</span>}
                {embed.show_count && <span className="rounded bg-muted px-1.5 py-0.5">Count</span>}
                {embed.show_breakdown && <span className="rounded bg-muted px-1.5 py-0.5">Breakdown</span>}
                {embed.show_snippet && <span className="rounded bg-muted px-1.5 py-0.5">Snippet</span>}
              </div>
              <Button size="sm" variant="outline" onClick={() => openDialog(embed)}>
                Review
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Action dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review embed request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product</span>
                  <span className="font-medium">{selected.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Domain</span>
                  <span className="font-medium">{selected.domain}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="font-medium">{selected.owner_company || selected.owner_email}</span>
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
                  placeholder="Reason for approval or revocation…"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="destructive"
              disabled={updateMut.isPending || selected?.status === "revoked"}
              onClick={() => handle("revoked")}
            >
              Revoke
            </Button>
            <Button
              disabled={updateMut.isPending || selected?.status === "approved"}
              onClick={() => handle("approved")}
            >
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
