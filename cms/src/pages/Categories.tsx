import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminCategory } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { toast } from "sonner";

export default function Categories() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; cat?: AdminCategory } | null>(null);
  const [form, setForm] = useState({ slug: "", label: "" });

  const { data: categories = [], isLoading } = useQuery<AdminCategory[]>({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/categories"),
  });

  const createMut = useMutation({
    mutationFn: (b: { slug: string; label: string }) => apiFetch("/admin/categories", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Category created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ slug, label }: { slug: string; label: string }) =>
      apiFetch(`/admin/categories/${slug}`, { method: "PATCH", body: JSON.stringify({ label }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Category updated"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (slug: string) => apiFetch(`/admin/categories/${slug}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Category deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  const openCreate = () => { setForm({ slug: "", label: "" }); setDialog({ mode: "create" }); };
  const openEdit = (c: AdminCategory) => { setForm({ slug: c.slug, label: c.label }); setDialog({ mode: "edit", cat: c }); };

  const handleSave = () => {
    if (dialog?.mode === "create") createMut.mutate(form);
    else if (dialog?.cat) updateMut.mutate({ slug: dialog.cat.slug, label: form.label });
  };

  return (
    <Layout
      title="Categories"
      action={<Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Category</Button>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-card border border-border rounded-lg animate-pulse" />)
          : categories.map(cat => (
              <div key={cat.slug} className="bg-card border border-border rounded-lg p-4 flex items-start justify-between gap-3 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Tag className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{cat.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{cat.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(cat)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Category</AlertDialogTitle>
                        <AlertDialogDescription>Delete "{cat.label}"? Products using this category may be affected.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(cat.slug)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
      </div>

      <Dialog open={!!dialog} onOpenChange={v => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New Category" : "Edit Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialog?.mode === "create" && (
              <div className="space-y-1.5">
                <Label>Slug <span className="text-muted-foreground text-xs">(URL-safe identifier)</span></Label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="e.g. electronics" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Label <span className="text-muted-foreground text-xs">(display name)</span></Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Electronics" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.label || (dialog?.mode === "create" && !form.slug) || createMut.isPending || updateMut.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
