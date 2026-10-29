import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const API = "/api";
const TOKEN_KEY = "sf_token";

export interface User {
  id: number;
  email: string;
  guest?: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** FastAPI returns `detail` as a string, or as a list of validation errors. */
function errorMessage(data: { detail?: unknown }, fallback: string): string {
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    const field = Array.isArray(first.loc) ? String(first.loc[first.loc.length - 1] ?? "") : "";
    const msg = (first.msg || fallback).replace(/^value is not a valid email address: /i, "");
    return field && field !== "body" ? `${field[0].toUpperCase()}${field.slice(1)}: ${msg}` : msg;
  }
  return fallback;
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const authFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const token = getToken();
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const url = input.startsWith("/api")
      ? input
      : `${API}${input.startsWith("/") ? input : `/${input}`}`;
    return fetch(url, {
      ...init,
      headers,
      credentials: "include",
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authFetch("/auth/me");
      if (!res.ok) {
        clearToken();
        setUser(null);
        return;
      }
      setUser(await res.json());
    } catch {
      clearToken();
      setUser(null);
    }
  }, [authFetch]);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(errorMessage(data, "Login failed"));
      }
      const data = await res.json();
      storeToken(data.access_token);
      setUser(data.user);
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(errorMessage(data, "Registration failed"));
      }
      const data = await res.json();
      storeToken(data.access_token);
      setUser(data.user);
    },
    []
  );

  const logout = useCallback(async () => {
    await fetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    clearToken();
    // Fall back to guest session when auth is not required
    await refreshUser();
  }, [refreshUser]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, authFetch }),
    [user, loading, login, register, logout, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
