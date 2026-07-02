import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FileText, MessageSquare, Package,
  Tag, BookOpen, Users, LogOut, ChevronRight, Building2, Code2, X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import logo from "@/assets/logo-tight.png";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Reviews", icon: FileText, to: "/reviews" },
  { label: "Comments", icon: MessageSquare, to: "/comments", badge: "pending" },
  { label: "Products", icon: Package, to: "/products" },
  { label: "Categories", icon: Tag, to: "/categories" },
  { label: "Pages", icon: BookOpen, to: "/pages" },
  { label: "Owners", icon: Building2, to: "/owners", badge: "owners" },
  { label: "Embeds", icon: Code2, to: "/embeds", badge: "embeds" },
  { label: "Users", icon: Users, to: "/users" },
];

interface Props {
  open?: boolean;
  onClose?: () => void;
  pendingComments?: number;
  pendingOwners?: number;
  pendingEmbeds?: number;
}

export function Sidebar({ open = false, onClose, pendingComments = 0, pendingOwners = 0, pendingEmbeds = 0 }: Props) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside
      className={cn(
        "w-64 flex-shrink-0 flex flex-col h-screen bg-[hsl(var(--sidebar))] text-white",
        // Mobile: slide-over drawer. Desktop (lg+): static column, always visible.
        "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 lg:transition-none",
        open ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-white/10">
        <img src={logo} alt="BdRanks CMS" className="h-8 w-auto object-contain brightness-0 invert" />
        <span className="ml-2 text-xs font-semibold tracking-widest uppercase text-white/50">CMS</span>
        <button
          onClick={onClose}
          className="ml-auto lg:hidden p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <p className="px-4 mb-2 text-[10px] uppercase tracking-widest font-semibold text-white/30">Menu</p>
        <ul className="space-y-0.5 px-2">
          {NAV.map(({ label, icon: Icon, to, badge }) => {
            const active = pathname === to || (to !== "/" && pathname.startsWith(to));
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge === "pending" && pendingComments > 0 && (
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {pendingComments}
                    </span>
                  )}
                  {badge === "owners" && pendingOwners > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {pendingOwners}
                    </span>
                  )}
                  {badge === "embeds" && pendingEmbeds > 0 && (
                    <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                      {pendingEmbeds}
                    </span>
                  )}
                  {active && <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
            {(user?.full_name || user?.email || "A")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.full_name || user?.username || "Admin"}</p>
            <p className="text-xs text-white/40 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors py-1.5 px-2 rounded hover:bg-white/8"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
