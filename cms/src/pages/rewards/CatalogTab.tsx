import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rewardsApi, type RewardItem } from "@/lib/rewardsApi";
import { uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Gift, ImagePlus } from "lucide-react";
import { toast } from "sonner";

type ItemForm = {
  name: string;
  description: string;
  fulfillment_type: "coupon" | "manual";
  points_cost: string;
  stock: string;
  image_url: string;
  is_active: boolean;
};

const emptyForm: ItemForm = {
  name: "",
  description: "",
  fulfillment_type: "manual",
  points_cost: "0",
  stock: "",
  image_url: "",
  is_active: true,
};

// Builds the COMPLETE item body expected by the admin PUT/POST endpoints. These
// endpoints perform a full-overwrite update (they don't merge partial bodies),
// so every field must always be present — never send a partial object.
function toBody(form: ItemForm, existingStock: number | null): Partial<RewardItem> {
  return {
    name: form.name.trim(),
    description: form.description,
    image_url: form.image_url,
    points_cost: Number(form.points_cost) || 0,
    fulfillment_type: form.fulfillment_type,
    // Coupon stock is derived from codes — preserve whatever the server has for it.
    stock: form.fulfillment_type === "manual" ? (form.stock === "" ? null : Number(form.stock)) : existingStock,
    is_active: form.is_active,
  };
}

function fullBody(item: RewardItem, overrides: Partial<RewardItem> = {}): Partial<RewardItem> {
  return {
    name: item.name,
    description: item.description,
    image_url: item.image_url,
    points_cost: item.points_cost,
    fulfillment_type: item.fulfillment_type,
    stock: item.stock,
    is_active: item.is_active,
    ...overrides,
  };
}

function stockLabel(item: RewardItem): string {
  return item.effective_stock == null ? "Unlimited" : `${item.effective_stock} left`;
}

export function CatalogTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; id?: number } | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [codesText, setCodesText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["reward-items"],
    queryFn: rewardsApi.items,
  });

  const editingItem = dialog?.mode === "edit" ? items.find((i) => i.id === dialog.id) : undefined;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reward-items"] });

  const createMut = useMutation({
    mutationFn: (body: Partial<RewardItem>) => rewardsApi.createItem(body),
    onSuccess: () => { invalidate(); toast.success("Item created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<RewardItem> }) => rewardsApi.updateItem(id, body),
    onSuccess: (_, vars) => {
      invalidate();
      toast.success("Item updated");
      // Only close the dialog for full-form saves; the inline active-toggle
      // on the card reuses this mutation but has no dialog open.
      if (dialog?.mode === "edit" && dialog.id === vars.id) setDialog(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => rewardsApi.deleteItem(id),
    onSuccess: () => { invalidate(); toast.success("Item deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const addCodesMut = useMutation({
    mutationFn: ({ id, codes }: { id: number; codes: string }) => rewardsApi.addCodes(id, codes),
    onSuccess: () => { invalidate(); toast.success("Codes added"); setCodesText(""); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreate = () => { setForm(emptyForm); setCodesText(""); setDialog({ mode: "create" }); };
  const openEdit = (item: RewardItem) => {
    setForm({
      name: item.name,
      description: item.description,
      fulfillment_type: item.fulfillment_type,
      points_cost: String(item.points_cost),
      stock: item.stock === null ? "" : String(item.stock),
      image_url: item.image_url || "",
      is_active: item.is_active,
    });
    setCodesText("");
    setDialog({ mode: "edit", id: item.id });
  };

  const handleSave = () => {
    const body = toBody(form, editingItem?.stock ?? null);
    if (dialog?.mode === "create") createMut.mutate(body);
    else if (editingItem) updateMut.mutate({ id: editingItem.id, body });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddCodes = () => {
    if (!editingItem || !codesText.trim()) return;
    addCodesMut.mutate({ id: editingItem.id, codes: codesText });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add item
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Gift className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No catalog items yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-card border border-border rounded-lg overflow-hidden flex flex-col">
              <div className="h-32 bg-muted flex items-center justify-center overflow-hidden">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <Gift className="h-8 w-8 text-muted-foreground opacity-40" />
                )}
              </div>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm text-foreground">{item.name}</span>
                  <Badge variant="outline" className="capitalize shrink-0">{item.fulfillment_type}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.points_cost} pts</span>
                  <span>·</span>
                  <span>{stockLabel(item)}</span>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={(v) => updateMut.mutate({ id: item.id, body: fullBody(item, { is_active: v }) })}
                    />
                    <span className="text-xs text-muted-foreground">{item.is_active ? "Active" : "Inactive"}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete item</AlertDialogTitle>
                          <AlertDialogDescription>Delete "{item.name}"? This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(item.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "Add item" : "Edit item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Item name" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the reward…"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fulfillment</Label>
                <Select
                  value={form.fulfillment_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, fulfillment_type: v as "coupon" | "manual" }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="coupon">Coupon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Points cost</Label>
                <Input
                  type="number"
                  value={form.points_cost}
                  onChange={(e) => setForm((f) => ({ ...f, points_cost: e.target.value }))}
                />
              </div>
            </div>
            {form.fulfillment_type === "manual" && (
              <div className="space-y-1.5">
                <Label>Stock <span className="text-muted-foreground text-xs">(blank = unlimited)</span></Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="Unlimited"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Image</Label>
              <div className="flex items-center gap-3">
                {form.image_url ? (
                  <img src={form.image_url} alt="" className="h-14 w-14 rounded-md object-cover border border-border" />
                ) : (
                  <div className="h-14 w-14 rounded-md border border-dashed border-border flex items-center justify-center">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? "Uploading…" : form.image_url ? "Change image" : "Upload image"}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>

            {dialog?.mode === "edit" && editingItem?.fulfillment_type === "coupon" && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label>Codes <span className="text-muted-foreground text-xs">({editingItem.effective_stock ?? 0} codes left)</span></Label>
                <Textarea
                  value={codesText}
                  onChange={(e) => setCodesText(e.target.value)}
                  placeholder={"One code per line\nCODE1\nCODE2"}
                  rows={4}
                />
                <Button type="button" variant="outline" size="sm" disabled={!codesText.trim() || addCodesMut.isPending} onClick={handleAddCodes}>
                  Add codes
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || uploading || isSaving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
