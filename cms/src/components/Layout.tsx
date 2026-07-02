import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the drawer when navigating
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => apiFetch<AdminStats>("/admin/stats"),
    staleTime: 30_000,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile drawer backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingComments={stats?.pending_comments}
        pendingOwners={stats?.pending_owners}
        pendingEmbeds={stats?.pending_embeds}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between gap-3 px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-foreground truncate">{title}</h1>
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>

      <Toaster position="top-right" />
    </div>
  );
}
