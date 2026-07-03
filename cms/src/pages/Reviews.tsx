import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminReview, type AdminReviewDetail } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, ExternalLink, Star, CheckCircle, XCircle, Pencil, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type ReviewForm = { title: string; content: string; rating: number; images: string[] };

export default function Reviews() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const qc = useQueryClient();

  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ReviewForm>({ title: "", content: "", rating: 5, images: [] });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: editing, isLoading: editLoading } = useQuery<AdminReviewDetail>({
    queryKey: ["admin-review", editId],
    queryFn: () => apiFetch(`/admin/reviews/${editId}`),
    enabled: editId !== null,
  });

  // Populate the form when the full review arrives
  useEffect(() => {
    if (editing) {
      setForm({
        title: editing.title,
        content: editing.content,
        rating: editing.rating,
        images: editing.images ?? [],
      });
    }
  }, [editing]);

  const { data, isLoading } = useQuery<{ data: AdminReview[]; total: number }>({
    queryKey: ["admin-reviews", page],
    queryFn: () => apiFetch(`/admin/reviews?limit=${limit}&offset=${page * limit}`),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      apiFetch(`/admin/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ is_approved: approved }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Review updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.success("Review deleted");
    },
    onError: () => toast.error("Failed to delete review"),
  });

  const saveMut = useMutation({
    mutationFn: (body: ReviewForm) =>
      apiFetch(`/admin/reviews/${editId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reviews"] });
      qc.invalidateQueries({ queryKey: ["admin-review", editId] });
      toast.success("Review saved");
      setEditId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await apiFetch<{ url: string }>("/upload/image", { method: "POST", body: fd });
      setForm(f => ({ ...f, images: [...f.images, url] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (idx: number) =>
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const pending = (data?.data ?? []).filter(rv => !rv.is_approved).length;

  const ratingColor = (r: number) =>
    r >= 4 ? "text-emerald-600" : r === 3 ? "text-amber-500" : "text-red-500";

  return (
    <Layout title="Reviews">
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {pending} review{pending !== 1 ? "s" : ""} awaiting moderation on this page
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Loading…" : `${data?.total ?? 0} total reviews`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Author</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rating</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                : (data?.data ?? []).map(rv => (
                    <tr key={rv.id} className={`hover:bg-muted/20 transition-colors ${!rv.is_approved ? "bg-amber-50/50" : ""}`}>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[220px] truncate">{rv.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rv.product}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rv.author}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 font-semibold ${ratingColor(rv.rating)}`}>
                          <Star className="h-3.5 w-3.5 fill-current" />
                          {rv.rating}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {rv.is_approved
                          ? <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">Approved</Badge>
                          : <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">Pending</Badge>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(rv.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {rv.is_approved ? (
                            <button
                              onClick={() => approveMut.mutate({ id: rv.id, approved: false })}
                              className="p-1.5 text-muted-foreground hover:text-amber-500 transition-colors"
                              title="Revoke approval"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => approveMut.mutate({ id: rv.id, approved: true })}
                              className="p-1.5 text-muted-foreground hover:text-emerald-500 transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditId(rv.id)}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit review"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <a
                            href={`http://localhost:5173/#/review/${rv.id}`}
                            target="_blank"
                            rel="noopener"
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Review</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{rv.title}" and all its comments, timeline entries, and images. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(rv.id)}>
                                  Delete
                                </AlertDialogAction>
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

        {(data?.total ?? 0) > limit && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page + 1} of {Math.ceil((data?.total ?? 0) / limit)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * limit >= (data?.total ?? 0)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit review dialog */}
      <Dialog open={editId !== null} onOpenChange={v => !v && setEditId(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Review</DialogTitle>
          </DialogHeader>

          {editLoading ? (
            <div className="space-y-4 py-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {editing && (
                <p className="text-xs text-muted-foreground">
                  {editing.product} · by {editing.author}
                </p>
              )}

              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Review title"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Content</Label>
                <Textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={6}
                  className="resize-y"
                  placeholder="Review content…"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Rating</Label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, rating: n }))}
                      className="p-0.5"
                      aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`h-6 w-6 transition-colors ${
                          n <= form.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">{form.rating}/5</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Images</Label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {form.images.map((url, i) => (
                    <div key={`${url}-${i}`} className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted">
                      <img src={url} alt={`Review image ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
                  >
                    {uploading
                      ? <Loader2 className="h-5 w-5 animate-spin" />
                      : <ImagePlus className="h-5 w-5" />}
                    <span className="text-[11px]">{uploading ? "Uploading…" : "Add image"}</span>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
            <Button
              onClick={() => saveMut.mutate(form)}
              disabled={editLoading || uploading || !form.title.trim() || saveMut.isPending}
            >
              {saveMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
