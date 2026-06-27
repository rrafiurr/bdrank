import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type AdminStats } from "@/lib/api";

interface Props {
  children: ReactNode;
  title: string;
  action?: ReactNode;
}

export function Layout({ children, title, action }: Props) {
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => apiFetch<AdminStats>("/admin/stats"),
    staleTime: 30_000,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar pendingComments={stats?.pending_comments} pendingOwners={stats?.pending_owners} pendingEmbeds={stats?.pending_embeds} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 flex-shrink-0">
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          {action && <div>{action}</div>}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      <Toaster position="top-right" />
    </div>
  );
}
