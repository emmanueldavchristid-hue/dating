import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, loadToken, onUnauthorized, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthValue {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Nouveau mot de passe avec le code reçu par e-mail ; connecte directement. */
  resetPassword: (email: string, code: string, password: string) => Promise<User>;
  register: (email: string, password: string, name: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me.get());
    } catch (e) {
      if (e instanceof ApiError && e.kind === "auth") await logout();
    }
  }, [logout]);

  useEffect(() => {
    onUnauthorized(() => {
      void logout();
    });
    (async () => {
      const t = await loadToken();
      if (t) await refresh();
      setReady(true);
    })();
    return () => onUnauthorized(null);
  }, [logout, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email.trim(), password);
    await setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, password: string) => {
    const res = await api.auth.reset(email.trim(), code.trim(), password);
    await setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const res = await api.auth.register(email.trim(), password, name.trim());
    await setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, resetPassword, register, logout, refresh, setUser }),
    [user, ready, login, resetPassword, register, logout, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth hors AuthProvider");
  return v;
}
