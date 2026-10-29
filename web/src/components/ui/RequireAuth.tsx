"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { LoginPrompt } from "./States";

/** Affiche le contenu uniquement si connecté ; sinon une invitation à se connecter. */
export function RequireAuth({ children, title, reason }: { children: ReactNode; title?: string; reason?: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="stack" aria-busy="true" aria-label="Chargement">
        <div className="skeleton" style={{ height: 120, borderRadius: 20 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
      </div>
    );
  if (!user) return <LoginPrompt title={title}>{reason}</LoginPrompt>;
  return <>{children}</>;
}
