"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, onUnauthorized, setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** false tant que la session locale n'a pas été vérifiée. */
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUserState(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      return;
    }
    try {
      setUserState(await api.me.get());
    } catch {
      // jeton expiré/invalide ou serveur injoignable : on reste anonyme
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    onUnauthorized(() => logout());
    refresh().finally(() => setReady(true));
    return () => onUnauthorized(null);
  }, [logout, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    setToken(res.access_token);
    setUserState(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await api.auth.register(email, password, displayName);
    setToken(res.access_token);
    setUserState(res.user);
    return res.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, ready, login, register, logout, refresh, setUser: setUserState }),
    [user, ready, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
