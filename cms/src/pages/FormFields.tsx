import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminCategory, type AdminReviewField } from "@/lib/api";
import { Layout } from "@/components/Layout";
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

export default function FormFields() {
  const qc = useQueryClient();
  const [category, setCategory] = useState<string>("");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; field?: AdminReviewField } | null>(null);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);

  const { data: categories = [] } = useQuery<AdminCategory[]>({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/categories"),
  });

  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0].slug);
  }, [categories, category]);

  const { data: fields = [], isLoading } = useQuery<AdminReviewField[]>({
    queryKey: ["review-fields", category],
    queryFn: () => apiFetch(`/admin/review-fields?scope=category&scope_ref=${category}`),
    enabled: !!category,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/admin/review-fields", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-fields", category] }); toast.success("Field created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiFetch(`/admin/review-fields/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-fields", category] }); toast.success("Field updated"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/review-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-fields", category] }); toast.success("Field deactivated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreate = () => { setForm({ ...EMPTY_FORM, sort_order: fields.length }); setDialog({ mode: "create" }); };
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
        scope: "category",
        scope_ref: category,
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
      const orig = dialog.field;
      const body: Record<string, unknown> = {};
      if (form.field_key !== orig.field_key) body.field_key = form.field_key;
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

  const setOption = (i: number, value: string) => setForm(f => ({ ...f, options: f.options.map((o, idx) => (idx === i ? value : o)) }));
  const addOption = () => setForm(f => ({ ...f, options: [...f.options, ""] }));
  const removeOption = (i: number) => setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));

  return (
    <Layout
      title="Form Fields"
      action={
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.slug} value={c.slug}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openCreate} disabled={!category}><Plus className="h-4 w-4 mr-1.5" />Add field</Button>
        </div>
      }
    >
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${fields.length} field${fields.length === 1 ? "" : "s"} for ${category}`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Label</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Key</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                : fields.map(f => (
                    <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {f.label}
                          {f.is_required && <Badge variant="secondary">Required</Badge>}
                          {!f.is_active && <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{f.field_key}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{f.type}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{f.sort_order}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
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
                                  Deactivate "{f.label}"? It will stop appearing on the review form, but existing reviews keep their submitted answers. This does not delete the field — it stays here marked Inactive.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(f.id)}>Deactivate</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
              {!isLoading && fields.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No fields for this category yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={v => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New Field" : "Edit Field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Field key <span className="text-muted-foreground text-xs">(stable identifier)</span></Label>
              <Input
                className="font-mono"
                value={form.field_key}
                onChange={e => setForm(f => ({ ...f, field_key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
                placeholder="e.g. response_time"
              />
            </div>
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
            <Button onClick={handleSave} disabled={!form.field_key || !form.label || createMut.isPending || updateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
