import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type AdminComment } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckCircle, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Comments() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: AdminComment[]; total: number }>({
    queryKey: ["admin-comments", page],
    queryFn: () => apiFetch(`/admin/comments?limit=${limit}&offset=${page * limit}`),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      apiFetch(`/admin/comments/${id}`, { method: "PATCH", body: JSON.stringify({ is_approved: approved }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-comments"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); toast.success("Comment updated"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-comments"] }); qc.invalidateQueries({ queryKey: ["admin-stats"] }); toast.success("Comment deleted"); },
    onError: () => toast.error("Failed to delete"),
  });

  const pending = (data?.data ?? []).filter(c => !c.is_approved).length;

  return (
    <Layout title="Comments">
      {pending > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <XCircle className="h-4 w-4 flex-shrink-0" />
          {pending} comment{pending !== 1 ? "s" : ""} awaiting moderation on this page
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${data?.total ?? 0} total comments`}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Comment</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Review</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Author</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                : (data?.data ?? []).map(cm => (
                    <tr key={cm.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-foreground max-w-[280px]">
                        <p className="line-clamp-2 text-sm">{cm.content}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate text-xs">{cm.review_title}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{cm.author}</td>
                      <td className="px-4 py-3">
                        {cm.is_approved
                          ? <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-xs">Approved</Badge>
                          : <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">Pending</Badge>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(cm.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {cm.is_approved ? (
                            <button onClick={() => approveMut.mutate({ id: cm.id, approved: false })} className="p-1.5 text-muted-foreground hover:text-amber-500 transition-colors" title="Reject">
                              <XCircle className="h-4 w-4" />
                            </button>
                          ) : (
                            <button onClick={() => approveMut.mutate({ id: cm.id, approved: true })} className="p-1.5 text-muted-foreground hover:text-emerald-500 transition-colors" title="Approve">
                              <CheckCircle className="h-4 w-4" />
                            </button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Comment</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete the comment. This cannot be undone.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(cm.id)}>Delete</AlertDialogAction>
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
