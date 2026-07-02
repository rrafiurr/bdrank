import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, type CmsUser } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery<CmsUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch("/admin/users"),
  });

  const toggleAdmin = useMutation({
    mutationFn: ({ id, isAdmin }: { id: number; isAdmin: boolean }) =>
      apiFetch(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ is_admin: isAdmin }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("User updated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Layout title="Users">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${users.length} users`}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Username</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Joined</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
                  ))
                : users.map(u => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-semibold text-xs uppercase">
                            {u.full_name ? u.full_name[0] : u.email[0]}
                          </div>
                          <div>
                            <p className="font-medium text-foreground leading-tight">{u.full_name || <span className="text-muted-foreground italic">No name</span>}</p>
                            {u.is_admin && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                <Shield className="h-3 w-3" />Admin
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{u.username || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.is_admin}
                            onCheckedChange={v => toggleAdmin.mutate({ id: u.id, isAdmin: v })}
                            disabled={u.id === me?.id}
                          />
                          {u.id === me?.id && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">You</Badge>
                          )}
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
