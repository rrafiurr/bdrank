import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminReview } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, ExternalLink, Star, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function Reviews() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const qc = useQueryClient();

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
    </Layout>
  );
}
