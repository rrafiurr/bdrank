import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, SITE_URL, type AdminPage } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

export default function Pages() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: pages = [], isLoading } = useQuery<AdminPage[]>({
    queryKey: ["admin-pages"],
    queryFn: () => apiFetch("/admin/pages"),
  });

  const publishMut = useMutation({
    mutationFn: ({ slug, is_published }: { slug: string; is_published: boolean }) =>
      apiFetch(`/admin/pages/${slug}`, { method: "PATCH", body: JSON.stringify({ is_published }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pages"] }); toast.success("Page updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (slug: string) => apiFetch(`/admin/pages/${slug}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-pages"] }); toast.success("Page deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  return (
    <Layout
      title="Pages"
      action={<Button size="sm" onClick={() => navigate("/pages/new")}><Plus className="h-4 w-4 mr-1.5" />New Page</Button>}
    >
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${pages.length} pages — published pages appear in the site footer and sitemap`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
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
                      <td className="px-4 py-3 font-medium text-foreground">
                        <button onClick={() => navigate(`/pages/${p.slug}/edit`)} className="hover:text-primary transition-colors">
                          {p.title}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.slug}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.is_published}
                            onCheckedChange={v => publishMut.mutate({ slug: p.slug, is_published: v })}
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
                            <a href={`${SITE_URL}/page/${p.slug}`} target="_blank" rel="noopener" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="View">
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button onClick={() => navigate(`/pages/${p.slug}/edit`)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
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
    </Layout>
  );
}
