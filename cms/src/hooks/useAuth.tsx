import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiFetch, type CmsUser } from "@/lib/api";

interface AuthCtx {
  user: CmsUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CmsUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cms_session");
      if (raw) {
        const { token: t, user: u } = JSON.parse(raw);
        setToken(t);
        setUser(u);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: CmsUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!data.user.is_admin) throw new Error("Access denied — admin only");
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("cms_session", JSON.stringify(data));
  };

  const logout = () => {
    apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
    setToken(null);
    setUser(null);
    localStorage.removeItem("cms_session");
  };

  return <Ctx.Provider value={{ user, token, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
