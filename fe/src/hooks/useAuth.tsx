import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export interface User {
  id: number;
  email: string;
  full_name: string;
  username: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  is_product_owner: boolean;
  owner_verified: boolean;
  company_name?: string;
  created_at: string;
}

interface AuthSession {
  token: string;
  user: User;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  setUser: () => {},
});

const SESSION_KEY = "auth_session";

function saveSession(session: AuthSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const session: AuthSession = JSON.parse(raw);
        setUserState(session.user);
        setToken(session.token);
      } catch {
        clearSession();
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
      null
    );
    saveSession(res);
    setToken(res.token);
    setUserState(res.user);
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const res = await apiFetch<{ token: string; user: User }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, full_name: fullName ?? "" }),
      },
      null
    );
    saveSession(res);
    setToken(res.token);
    setUserState(res.user);
  };

  const signOut = async () => {
    if (token) {
      await apiFetch("/auth/logout", { method: "POST" }, token).catch(() => {});
    }
    clearSession();
    setToken(null);
    setUserState(null);
  };

  const setUser = (updated: User) => {
    setUserState(updated);
    if (token) {
      saveSession({ token, user: updated });
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signIn, signUp, signOut, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
