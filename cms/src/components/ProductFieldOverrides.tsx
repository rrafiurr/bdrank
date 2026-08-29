import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminCategory, type AdminProduct, type AdminReviewField } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

const TYPES = ["text", "url", "select", "number"] as const;

type FieldForm = {
  field_key: string;
  label: string;
  type: (typeof TYPES)[number];
  is_required: boolean;
  options: string[];
  min_value: number | null;
  max_value: number | null;
  help_text: string;
  sort_order: number;
};

const EMPTY_FORM: FieldForm = {
  field_key: "",
  label: "",
  type: "text",
  is_required: false,
  options: [],
  min_value: null,
  max_value: null,
  help_text: "",
  sort_order: 0,
};

interface Props {
  /** null closes the dialog; a product opens the overrides panel for it. */
  product: AdminProduct | null;
  onOpenChange: (open: boolean) => void;
}

export function ProductFieldOverrides({ product, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; field?: AdminReviewField } | null>(null);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);

  const category = product?.category ?? "";
  const productId = product?.id ?? 0;

  // Close any in-flight add/edit form when the panel is closed or swapped to
  // a different product, so stale form state can't leak into the next open.
  useEffect(() => {
    setDialog(null);
  }, [product?.id]);

  const { data: categories = [] } = useQuery<AdminCategory[]>({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/categories"),
  });
  const categoryLabel = categories.find(c => c.slug === category)?.label ?? category;

  const { data: inherited = [], isLoading: inheritedLoading } = useQuery<AdminReviewField[]>({
    queryKey: ["review-fields", "category", category],
    queryFn: () => apiFetch(`/admin/review-fields?scope=category&scope_ref=${category}`),
    enabled: !!product && !!category,
  });

  const { data: own = [], isLoading: ownLoading } = useQuery<AdminReviewField[]>({
    queryKey: ["review-fields", "product", String(productId)],
    queryFn: () => apiFetch(`/admin/review-fields?scope=product&scope_ref=${productId}`),
    enabled: !!product,
  });

  // The resolved list a reviewer would actually see for this product right
  // now: active category + product fields, merged, with hides applied.
  // There is no admin endpoint that lists product_field_hides rows directly,
  // so this is how "is this inherited field hidden?" gets answered — it is
  // an INFERENCE, not a direct read: an active inherited field whose id is
  // absent from this resolved list has been hidden for this product. That
  // means this query must be invalidated alongside the admin queries after
  // every hide toggle and every field write below, or the switches will
  // show stale state.
  const { data: resolved = [], isLoading: resolvedLoading } = useQuery<AdminReviewField[]>({
    queryKey: ["review-fields-resolved", productId],
    queryFn: () => apiFetch(`/review-fields?product_id=${productId}`),
    enabled: !!product,
  });
  const resolvedIds = new Set(resolved.map(f => f.id));

  // Returns the aggregate promise (rather than firing invalidateQueries and
  // moving on) so that returning it from onSuccess keeps a mutation pending
  // until all three refetches have actually landed. TanStack Query awaits
  // whatever onSuccess returns before settling the mutation; drop the
  // return and `hideMut.isPending` flips false as soon as the POST
  // resolves, re-enabling the Switch a beat before the resolved-list
  // refetch above lands — a visible flicker back to the pre-toggle state.
  // Do not "simplify" this back to a fire-and-forget void function.
  const invalidateAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["review-fields", "category", category] }),
      qc.invalidateQueries({ queryKey: ["review-fields", "product", String(productId)] }),
      qc.invalidateQueries({ queryKey: ["review-fields-resolved", productId] }),
    ]);

  const hideMut = useMutation({
    mutationFn: ({ fieldId, hidden }: { fieldId: number; hidden: boolean }) =>
      apiFetch(`/admin/products/${productId}/field-hides`, {
        method: "POST",
        body: JSON.stringify({ field_id: fieldId, hidden }),
      }),
    onSuccess: invalidateAll,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update visibility"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/admin/review-fields", { method: "POST", body: JSON.stringify(body) }),
    // toast/setDialog run synchronously so the dialog closes right away;
    // returning invalidateAll()'s promise still keeps createMut.isPending
    // true until the refetches land, same reasoning as invalidateAll above.
    onSuccess: () => { toast.success("Field created"); setDialog(null); return invalidateAll(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`/admin/review-fields/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Field updated"); setDialog(null); return invalidateAll(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/review-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Field deactivated"); return invalidateAll(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreate = () => { setForm({ ...EMPTY_FORM, sort_order: own.length }); setDialog({ mode: "create" }); };
  const openEdit = (f: AdminReviewField) => {
    setForm({
      field_key: f.field_key,
      label: f.label,
      type: f.type,
      is_required: f.is_required,
      options: f.options ?? [],
      min_value: f.min_value,
      max_value: f.max_value,
      help_text: f.help_text ?? "",
      sort_order: f.sort_order,
    });
    setDialog({ mode: "edit", field: f });
  };

  const handleSave = () => {
    const options = form.type === "select" ? form.options.map(o => o.trim()).filter(Boolean) : [];
    const min_value = form.type === "number" ? form.min_value : null;
    const max_value = form.type === "number" ? form.max_value : null;

    if (dialog?.mode === "create") {
      createMut.mutate({
        scope: "product",
        scope_ref: String(productId),
        field_key: form.field_key,
        label: form.label,
        type: form.type,
        is_required: form.is_required,
        options,
        min_value,
        max_value,
        help_text: form.help_text,
        sort_order: form.sort_order,
      });
      return;
    }

    if (dialog?.field) {
      // Same partial-PATCH-diff convention as FormFields.tsx: only include a
      // key when it actually changed, since an included-but-unchanged
      // min_value/max_value would be indistinguishable from an intentional
      // clear on the server.
      const orig = dialog.field;
      const body: Record<string, unknown> = {};
      if (form.label !== orig.label) body.label = form.label;
      if (form.type !== orig.type) body.type = form.type;
      if (form.is_required !== orig.is_required) body.is_required = form.is_required;
      if (form.help_text !== (orig.help_text ?? "")) body.help_text = form.help_text;
      if (form.sort_order !== orig.sort_order) body.sort_order = form.sort_order;
      if (JSON.stringify(options) !== JSON.stringify(orig.options ?? [])) body.options = options;
      if (min_value !== orig.min_value) body.min_value = min_value;
      if (max_value !== orig.max_value) body.max_value = max_value;

      if (Object.keys(body).length === 0) { setDialog(null); return; }
      updateMut.mutate({ id: orig.id, body });
    }
  };

  const hasEmptyOptions = form.type === "select" && form.options.map(o => o.trim()).filter(Boolean).length === 0;
  const minExceedsMax = form.type === "number" && form.min_value !== null && form.max_value !== null && form.min_value > form.max_value;

  const setOption = (i: number, value: string) => setForm(f => ({ ...f, options: f.options.map((o, idx) => (idx === i ? value : o)) }));
  const addOption = () => setForm(f => ({ ...f, options: [...f.options, ""] }));
  const removeOption = (i: number) => setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));

  // Fields the category already deactivated can never appear on any
  // product's form again, so a hide toggle for one would be meaningless —
  // only show switches for the ones still active.
  const activeInherited = inherited.filter(f => f.is_active);

  return (
    <>
      <Dialog open={!!product} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fields — {product?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-foreground">Inherited from {categoryLabel}</h3>
              </div>
              <div className="divide-y divide-border">
                {inheritedLoading || resolvedLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
                  ))
                ) : activeInherited.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No inherited fields for this category.</div>
                ) : (
                  activeInherited.map(f => {
                    const hidden = !resolvedIds.has(f.id);
                    return (
                      <div key={f.id} className="flex items-center justify-between px-4 py-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{f.label}</span>
                            {f.is_required && <Badge variant="secondary">Required</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">{f.field_key}</p>
                        </div>
                        <Switch
                          checked={!hidden}
                          disabled={hideMut.isPending}
                          onCheckedChange={(v) => hideMut.mutate({ fieldId: f.id, hidden: !v })}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">This product's own fields</h3>
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Add field
                </Button>
              </div>
              <div className="divide-y divide-border">
                {ownLoading ? (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="px-4 py-3"><Skeleton className="h-5 w-full" /></div>
                  ))
                ) : own.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No fields added for this product yet.</div>
                ) : (
                  own.map(f => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{f.label}</span>
                          <Badge variant="outline" className="capitalize">{f.type}</Badge>
                          {f.is_required && <Badge variant="secondary">Required</Badge>}
                          {!f.is_active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">{f.field_key}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => openEdit(f)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" disabled={!f.is_active}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Deactivate Field</AlertDialogTitle>
                              <AlertDialogDescription>
                                Deactivate "{f.label}"? It will stop appearing on the review form for this product, but existing reviews keep their submitted answers. This does not delete the field — it stays here marked Inactive.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(f.id)}>Deactivate</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialog} onOpenChange={v => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New Field" : "Edit Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialog?.mode === "create" ? (
              <div className="space-y-1.5">
                <Label>Field key <span className="text-muted-foreground text-xs">(stable identifier)</span></Label>
                <Input
                  className="font-mono"
                  value={form.field_key}
                  onChange={e => setForm(f => ({ ...f, field_key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                  placeholder="e.g. response_time"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Field key <span className="text-muted-foreground text-xs">(immutable)</span></Label>
                <p className="text-sm font-mono text-muted-foreground">{form.field_key}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Label <span className="text-muted-foreground text-xs">(display name)</span></Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Response Time" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v: FieldForm["type"]) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.type === "select" && (
              <div className="space-y-1.5">
                <Label>Options</Label>
                <div className="space-y-2">
                  {form.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={o} onChange={e => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                      <button onClick={() => removeOption(i)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Add option
                  </Button>
                </div>
              </div>
            )}

            {form.type === "number" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Min value <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    type="number"
                    value={form.min_value ?? ""}
                    onChange={e => setForm(f => ({ ...f, min_value: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Max value <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    type="number"
                    value={form.max_value ?? ""}
                    onChange={e => setForm(f => ({ ...f, max_value: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Help text <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea value={form.help_text} onChange={e => setForm(f => ({ ...f, help_text: e.target.value }))} placeholder="Shown beneath the field on the review form" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Sort order</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Required</Label>
              <Switch checked={form.is_required} onCheckedChange={v => setForm(f => ({ ...f, is_required: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.field_key || !form.label || hasEmptyOptions || minExceedsMax || createMut.isPending || updateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
