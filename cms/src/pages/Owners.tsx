import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BadgeCheck, Building2, Package } from "lucide-react";
import { toast } from "sonner";

interface AdminOwner {
  id: number;
  email: string;
  full_name: string;
  company_name: string;
  owner_verified: boolean;
  created_at: string;
  product_ids: number[];
  product_names: string[];
}

interface AdminProduct {
  id: number;
  name: string;
  category: string;
  owner_id: number | null;
}

export default function Owners() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<AdminOwner | null>(null);
  const [pickedProductIds, setPickedProductIds] = useState<number[]>([]);

  const { data: owners = [], isLoading } = useQuery<AdminOwner[]>({
    queryKey: ["admin-owners"],
    queryFn: () => apiFetch("/admin/owners"),
  });

  const { data: allProducts = [] } = useQuery<{ data: AdminProduct[] }>({
    queryKey: ["admin-products-owner"],
    queryFn: () => apiFetch("/products?limit=500"),
    select: d => d,
  });

  const products: AdminProduct[] = (allProducts as any)?.data ?? [];

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { owner_verified?: boolean; product_ids?: number[] } }) =>
      apiFetch(`/admin/owners/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-owners"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Owner updated");
      setSelected(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openDialog = (o: AdminOwner) => {
    setSelected(o);
    setPickedProductIds(o.product_ids ?? []);
  };

  const toggleProduct = (pid: number) => {
    setPickedProductIds(prev =>
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  const handleSave = () => {
    if (!selected) return;
    updateMut.mutate({ id: selected.id, body: { product_ids: pickedProductIds } });
  };

  const pending = owners.filter(o => !o.owner_verified).length;

  return (
    <Layout title="Product Owners">
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <BadgeCheck className="h-4 w-4 flex-shrink-0" />
          {pending} product owner{pending !== 1 ? "s" : ""} awaiting verification
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-card border border-border rounded-lg animate-pulse" />)
          : owners.map(o => (
              <div key={o.id} className={`bg-card border rounded-lg p-4 ${o.owner_verified ? "border-border" : "border-amber-200 bg-amber-50/30"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${o.owner_verified ? "bg-primary/10" : "bg-amber-100"}`}>
                      <Building2 className={`h-5 w-5 ${o.owner_verified ? "text-primary" : "text-amber-600"}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{o.company_name}</p>
                      <p className="text-xs text-muted-foreground">{o.full_name} · {o.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {o.owner_verified
                      ? <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs shrink-0"><BadgeCheck className="h-3 w-3 mr-1" />Verified</Badge>
                      : <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs shrink-0">Pending</Badge>
                    }
                  </div>
                </div>

                {/* Verify toggle */}
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={o.owner_verified}
                      onCheckedChange={v => updateMut.mutate({ id: o.id, body: { owner_verified: v } })}
                    />
                    <span className="text-sm text-muted-foreground">{o.owner_verified ? "Verified" : "Verify account"}</span>
                  </div>
                  <button
                    onClick={() => openDialog(o)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Package className="h-3.5 w-3.5" />
                    {o.product_ids?.length ? `${o.product_ids.length} product${o.product_ids.length !== 1 ? "s" : ""}` : "Assign products"}
                  </button>
                </div>

                {/* Assigned products */}
                {o.product_names?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {o.product_names.map((name, i) => (
                      <span key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
      </div>

      {/* Product assignment dialog */}
      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Products — {selected?.company_name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-3">
              Select the products this owner manages. Each product can only have one owner.
            </p>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {products.map(p => {
                const takenByOther = p.owner_id !== null && p.owner_id !== selected?.id;
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 ${takenByOther ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={pickedProductIds.includes(p.id)}
                      disabled={takenByOther}
                      onChange={() => !takenByOther && toggleProduct(p.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-foreground flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{p.category}</span>
                    {takenByOther && <span className="text-xs text-muted-foreground">owned</span>}
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
