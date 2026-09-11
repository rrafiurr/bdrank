import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, SITE_URL, type AdminFeedback, type FeedbackStatus } from "@/lib/api";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Reply } from "lucide-react";
import { toast } from "sonner";

const STATUSES: { value: FeedbackStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "spam", label: "Spam" },
];

const TYPES: { value: AdminFeedback["type"]; label: string; className: string }[] = [
  { value: "bug", label: "Bug", className: "text-red-700 border-red-200 bg-red-50" },
  { value: "idea", label: "Idea", className: "text-sky-700 border-sky-200 bg-sky-50" },
  { value: "complaint", label: "Complaint", className: "text-amber-700 border-amber-200 bg-amber-50" },
  { value: "praise", label: "Praise", className: "text-emerald-700 border-emerald-200 bg-emerald-50" },
  { value: "other", label: "Other", className: "text-muted-foreground border-border bg-muted/40" },
];

const REPLY_MAX = 2000;
const typeInfo = (t: string) => TYPES.find((x) => x.value === t) ?? TYPES[4];
/** Characters as the server counts them (code points), after trimming. */
const chars = (s: string) => [...s.trim()].length;

type UpdateBody = { status?: FeedbackStatus; admin_reply?: string };

export default function Feedback() {
  const [status, setStatus] = useState<string>("new");
  const [type, setType] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const limit = 50;
  const qc = useQueryClient();

  const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);

  const { data, isLoading } = useQuery<{ data: AdminFeedback[]; total: number }>({
    queryKey: ["admin-feedback", status, type, page],
    queryFn: () => apiFetch(`/admin/feedback?${params}`),
  });
  const items = data?.data ?? [];
  const total = data?.total ?? 0;
  const open = items.find((f) => f.id === openId) ?? null;

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateBody }) =>
      apiFetch(`/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      if (vars.body.admin_reply !== undefined) {
        toast.success(vars.body.admin_reply.trim() ? "Reply saved" : "Reply removed");
        setOpenId(null);
      } else {
        toast.success("Status updated");
      }
    },
    onError: (err: Error) => toast.error(err.message || "Update failed"),
  });

  const changeFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(0);
  };

  const openItem = (f: AdminFeedback) => {
    setOpenId(f.id);
    setReply(f.admin_reply);
  };

  const replyChars = chars(reply);
  const replyUnchanged = open !== null && reply.trim() === open.admin_reply;

  return (
    <Layout title="Feedback">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground mr-auto">{isLoading ? "Loading…" : `${total} matching`}</p>
          <Select value={status} onValueChange={changeFilter(setStatus)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={changeFilter(setType)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Message</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Page</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No feedback matches these filters.</td>
                </tr>
              ) : (
                items.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20 transition-colors align-top">
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{new Date(f.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs max-w-[180px]">
                      <p className="font-medium text-foreground truncate">{f.user.username || "—"}</p>
                      <p className="text-muted-foreground truncate">{f.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={`text-xs ${typeInfo(f.type).className}`}>{typeInfo(f.type).label}</Badge>
                    </td>
                    <td className="px-4 py-3 max-w-[320px]">
                      <button onClick={() => openItem(f)} className="text-left text-foreground hover:text-primary transition-colors" title="Open">
                        <p className="line-clamp-2 break-words">{f.message}</p>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{f.page_path || "—"}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={f.status}
                        onValueChange={(v) => updateMut.mutate({ id: f.id, body: { status: v as FeedbackStatus } })}
                      >
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openItem(f)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Reply className="h-3.5 w-3.5" />
                        {f.admin_reply ? (f.reply_unread ? "Sent · unseen" : "Sent · seen") : "Reply"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page + 1} of {Math.ceil(total / limit)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-xs ${typeInfo(open.type).className}`}>{typeInfo(open.type).label}</Badge>
                  Feedback #{open.id}
                </DialogTitle>
                <DialogDescription>
                  {open.user.username || "—"} · {open.user.email} · {new Date(open.created_at).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              {/* Plain text only: React escapes it, and pre-wrap keeps the user's line breaks. */}
              <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-words">
                {open.message}
              </div>

              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Page</dt>
                <dd className="break-all">
                  {open.page_path ? (
                    // The server only keeps paths starting with a single "/", so this always stays on our site.
                    <a href={`${SITE_URL}${open.page_path}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {open.page_path}
                    </a>
                  ) : "—"}
                </dd>
                <dt className="text-muted-foreground">Browser</dt>
                <dd className="break-all text-muted-foreground">{open.user_agent || "—"}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{STATUSES.find((s) => s.value === open.status)?.label}</dd>
              </dl>

              <div className="space-y-2">
                <label htmlFor="feedback-reply" className="text-sm font-medium">Reply to the user</label>
                <Textarea
                  id="feedback-reply"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="The user sees this on their profile. Leave empty to remove the reply."
                  className="min-h-[120px]"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {open.replied_at
                      ? `Replied ${new Date(open.replied_at).toLocaleString()} · ${open.reply_unread ? "not seen yet" : "seen"}`
                      : "No reply yet"}
                  </span>
                  <span className={replyChars > REPLY_MAX ? "text-destructive" : ""}>{replyChars} / {REPLY_MAX}</span>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenId(null)}>Close</Button>
                <Button
                  disabled={updateMut.isPending || replyChars > REPLY_MAX || replyUnchanged}
                  onClick={() => updateMut.mutate({ id: open.id, body: { admin_reply: reply } })}
                >
                  {reply.trim() === "" && open.admin_reply ? "Remove reply" : "Save reply"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
