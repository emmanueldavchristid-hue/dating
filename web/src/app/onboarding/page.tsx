"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconArrowLeft, IconArrowRight, IconCheck } from "@/components/icons";
import { CityPicker } from "@/components/location/CityPicker";
import { ConsentCard } from "@/components/location/ConsentCard";
import { AmbianceChips, BudgetPicker, CategoryTiles } from "@/components/prefs/PrefPickers";
import { LogoMark } from "@/components/shell/Logo";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import { APP_NAME, STORAGE_KEYS } from "@/lib/config";
import { readJSON, writeJSON, writeStorage } from "@/lib/storage";
import type { Preferences } from "@/lib/types";
import styles from "./onboarding.module.css";

const STEPS = ["Vos envies", "Ambiance & budget", "Votre zone"];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { city } = useLocation();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState<string[]>([]);
  const [ambs, setAmbs] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const prefs = user?.preferences ?? readJSON<Preferences>(STORAGE_KEYS.prefs);
    if (prefs) {
      setCats(prefs.categories ?? []);
      setAmbs(prefs.ambiances ?? []);
      setBudget(prefs.budget_max_fcfa ?? null);
    }
  }, [user]);

  const finish = async (skip = false) => {
    writeStorage(STORAGE_KEYS.onboarded, "1");
    if (skip) {
      router.replace("/");
      return;
    }
    const prefs: Preferences = { categories: cats, ambiances: ambs, budget_max_fcfa: budget, home_city: city };
    writeJSON(STORAGE_KEYS.prefs, prefs);
    if (user) {
      setBusy(true);
      try {
        setUser(await api.me.updatePreferences(prefs));
      } catch (e) {
        toast(`Préférences gardées sur cet appareil : ${errorMessage(e)}`, "error");
      } finally {
        setBusy(false);
      }
    }
    toast("C'est noté ! Vos suggestions sont personnalisées.", "success");
    router.replace("/");
  };

  return (
    <div className={styles.wrap}>
      <title>Bienvenue</title>
      <header className={styles.head}>
        <div className="row" style={{ gap: 10 }}>
          <LogoMark size={28} />
          <span className={styles.brand}>{APP_NAME}</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => finish(true)}>
          Passer
        </button>
      </header>

      <div className={styles.progress} aria-label={`Étape ${step + 1} sur ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <div key={s} className={styles.progressItem} data-state={i < step ? "done" : i === step ? "current" : "todo"}>
            <span className={styles.progressBar} />
            <span className={styles.progressLabel}>{s}</span>
          </div>
        ))}
      </div>

      <main className={styles.main}>
        {step === 0 ? (
          <section className="fade-in" key="s0">
            <p className="eyebrow">Étape 1 sur 3</p>
            <h1 className={styles.title}>Qu&apos;est-ce qui vous fait sortir&nbsp;?</h1>
            <p className={styles.sub}>Choisissez autant de catégories que vous voulez. On s&apos;en sert pour trier vos suggestions.</p>
            <CategoryTiles value={cats} onChange={setCats} />
          </section>
        ) : step === 1 ? (
          <section className="fade-in" key="s1">
            <p className="eyebrow">Étape 2 sur 3</p>
            <h1 className={styles.title}>Quelle ambiance, quel budget&nbsp;?</h1>
            <p className={styles.sub}>Le budget est indicatif, par personne, en francs CFA.</p>
            <h2 className={styles.h2}>Ambiances</h2>
            <AmbianceChips value={ambs} onChange={setAmbs} />
            <h2 className={styles.h2}>Budget</h2>
            <BudgetPicker value={budget} onChange={setBudget} />
          </section>
        ) : (
          <section className="fade-in" key="s2">
            <p className="eyebrow">Étape 3 sur 3</p>
            <h1 className={styles.title}>D&apos;où partez-vous en général&nbsp;?</h1>
            <p className={styles.sub}>Pour afficher les distances et les lieux proches. Rien n&apos;est demandé à votre téléphone sans votre accord.</p>
            <ConsentCard />
            <h2 className={styles.h2}>Ou choisissez votre ville et votre quartier</h2>
            <CityPicker />
          </section>
        )}
      </main>

      <footer className={styles.foot}>
        <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0} aria-label="Étape précédente">
          <IconArrowLeft /> Retour
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep((s) => s + 1)}>
            Continuer <IconArrowRight />
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg" onClick={() => finish(false)} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <IconCheck />} C&apos;est parti
          </button>
        )}
      </footer>
    </div>
  );
}
