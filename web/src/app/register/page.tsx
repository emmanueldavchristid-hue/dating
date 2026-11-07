"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/config";
import { safeNext } from "@/lib/routes";
import { readJSON } from "@/lib/storage";
import type { Preferences } from "@/lib/types";

function RegisterForm() {
  const { register, setUser } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(email.trim(), password, name.trim());
      // Reprise des préférences saisies avant inscription
      const local = readJSON<Preferences>(STORAGE_KEYS.prefs);
      if (local) {
        try {
          setUser(await api.me.updatePreferences(local));
        } catch {
          /* non bloquant */
        }
      }
      const consent = readJSON<{ consent: string }>(STORAGE_KEYS.consent);
      if (consent?.consent === "granted") {
        try {
          setUser(await api.me.consent(true));
        } catch {
          /* non bloquant */
        }
      }
      router.replace(next);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Créer mon compte"
      subtitle="Gratuit. Gardez vos adresses préférées et composez vos soirées."
      footer={
        <>
          Déjà inscrit ?{" "}
          <Link href={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">
            Se connecter
          </Link>
        </>
      }
    >
      <title>Inscription</title>
      <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
        <label className="field">
          <span className="label">Prénom ou pseudo</span>
          <input className="input" autoComplete="nickname" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Awa" />
        </label>
        <label className="field">
          <span className="label">E-mail</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.ci" />
        </label>
        <label className="field">
          <span className="label">Mot de passe</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="pw-hint"
          />
          <span id="pw-hint" className="hint">
            8 caractères minimum.
          </span>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !email || !password || !name.trim()}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          Créer mon compte
        </button>
      </form>
    </AuthLayout>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
