import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminPage } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

type PageForm = { slug: string; title: string; meta_description: string; content: string; is_published: boolean };

export default function Pages() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; page?: AdminPage } | null>(null);
  const [form, setForm] = useState<PageForm>({ slug: "", title: "", meta_description: "", content: "", is_published: false });

  const { data: pages = [], isLoading } = useQuery<AdminPage[]>({
    queryKey: ["admin-pages"],
    queryFn: () => apiFetch("/admin/pages"),
  });

  const createMut = useMutation({
    mutationFn: (body: PageForm) => apiFetch("/admin/pages", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pages"] }); toast.success("Page created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ slug, body }: { slug: string; body: Partial<PageForm> }) =>
      apiFetch(`/admin/pages/${slug}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pages"] }); toast.success("Page updated"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (slug: string) => apiFetch(`/admin/pages/${slug}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pages"] }); toast.success("Page deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  const openCreate = () => { setForm({ slug: "", title: "", meta_description: "", content: "", is_published: false }); setDialog({ mode: "create" }); };
  const openEdit = (p: AdminPage) => { setForm({ slug: p.slug, title: p.title, meta_description: p.meta_description, content: p.content ?? "", is_published: p.is_published }); setDialog({ mode: "edit", page: p }); };

  const handleSave = () => {
    if (dialog?.mode === "create") createMut.mutate(form);
    else if (dialog?.page) updateMut.mutate({ slug: dialog.page.slug, body: form });
  };

  const togglePublish = (p: AdminPage) => {
    updateMut.mutate({ slug: p.slug, body: { is_published: !p.is_published } });
  };

  return (
    <Layout
      title="Pages"
      action={<Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" />New Page</Button>}
    >
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${pages.length} pages`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-4 py-3"><div className="h-5 bg-muted animate-pulse rounded w-full" /></td></tr>
                  ))
                : pages.map(p => (
                    <tr key={p.slug} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{p.title}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.slug}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.is_published}
                            onCheckedChange={() => togglePublish(p)}
                            className="scale-75"
                          />
                          <Badge variant="outline" className={p.is_published ? "text-emerald-600 border-emerald-200 bg-emerald-50 text-xs" : "text-muted-foreground text-xs"}>
                            {p.is_published ? "Published" : "Draft"}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.updated_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {p.is_published && (
                            <a href={`http://localhost:5173/page/${p.slug}`} target="_blank" rel="noopener" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="View">
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
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
                                <AlertDialogTitle>Delete Page</AlertDialogTitle>
                                <AlertDialogDescription>Delete "{p.title}"? This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(p.slug)}>Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={v => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New Page" : `Edit: ${dialog?.page?.title}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            {dialog?.mode === "create" && (
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))} placeholder="about-us" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Page title" />
            </div>
            <div className="space-y-1.5">
              <Label>Meta Description <span className="text-muted-foreground text-xs">(for SEO)</span></Label>
              <Input value={form.meta_description} onChange={e => setForm(f => ({ ...f, meta_description: e.target.value }))} placeholder="Short description…" maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label>HTML Content</Label>
              <Textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="<h2>About Us</h2><p>…</p>"
                className="font-mono text-sm min-h-[280px] resize-y"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="published"
                checked={form.is_published}
                onCheckedChange={v => setForm(f => ({ ...f, is_published: v }))}
              />
              <Label htmlFor="published" className="cursor-pointer">Publish this page</Label>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.title || (dialog?.mode === "create" && !form.slug) || createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
