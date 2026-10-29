"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconChevronRight, IconCrown, IconDownload, IconHeart, IconLocate, IconLogout, IconRoute, IconSettings, IconShield, IconTrash } from "@/components/icons";
import { AmbianceChips, BudgetPicker, CategoryTiles } from "@/components/prefs/PrefPickers";
import { Modal } from "@/components/ui/Modal";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import { APP_NAME, STORAGE_KEYS } from "@/lib/config";
import { formatDate, planLabel } from "@/lib/format";
import { writeJSON } from "@/lib/storage";
import type { Preferences, Subscription } from "@/lib/types";
import styles from "./me.module.css";

const ROLE_LABEL = { user: "Membre", curator: "Curateur", admin: "Administrateur" } as const;

function Profile() {
  const { user, setUser, logout } = useAuth();
  const { cities } = useMeta();
  const { consent, acceptGps, declineGps, gpsStatus } = useLocation();
  const toast = useToast();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) setPrefs(user.preferences);
  }, [user]);

  useEffect(() => {
    api.me
      .subscription()
      .then(setSub)
      .catch(() => setSub(null));
  }, []);

  if (!user || !prefs) return null;

  const dirty = JSON.stringify(prefs) !== JSON.stringify(user.preferences);
  const consentOn = consent === "granted" || (consent === "unknown" && user.location_consent);

  const save = async () => {
    setSaving(true);
    try {
      const u = await api.me.updatePreferences(prefs);
      setUser(u);
      writeJSON(STORAGE_KEYS.prefs, u.preferences);
      toast("Préférences enregistrées", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await api.me.export();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${APP_NAME.toLowerCase()}-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Export téléchargé", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await api.me.remove();
      logout();
      toast("Votre compte et vos données ont été supprimés.", "success");
      router.replace("/");
    } catch (e) {
      toast(errorMessage(e), "error");
      setDeleting(false);
    }
  };

  return (
    <>
      <section className={styles.profile}>
        <span className={styles.avatar} aria-hidden="true">
          {user.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div className={styles.who}>
          <h1 className={styles.name}>{user.display_name}</h1>
          <p className="muted">{user.email}</p>
          <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            <span className={`badge ${user.plan === "free" ? "" : "badge-gold"}`}>
              {user.plan !== "free" ? <IconCrown /> : null} Offre {planLabel(user.plan)}
            </span>
            {user.role !== "user" ? <span className="badge badge-accent">{ROLE_LABEL[user.role]}</span> : null}
          </div>
        </div>
      </section>

      <section className={`${styles.planCard} ${user.plan !== "free" ? styles.planPaid : ""}`}>
        <div>
          <p className={styles.planTitle}>
            <IconCrown size={18} /> {user.plan === "free" ? "Passez à Plus ou Insider" : `Membre ${planLabel(user.plan)}`}
          </p>
          <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            {sub
              ? `Statut : ${sub.status}${sub.current_period_end ? ` · jusqu'au ${formatDate(sub.current_period_end)}` : ""}`
              : user.plan === "free"
                ? "Pépites, soirées jusqu'à 5 étapes et plus de concierge."
                : "Merci de soutenir les bonnes adresses locales."}
          </p>
        </div>
        <Link href="/premium" className={`btn btn-sm ${user.plan === "free" ? "btn-gold" : ""}`}>
          {user.plan === "free" ? "Voir les offres" : "Gérer"}
        </Link>
      </section>

      <nav className={styles.quick} aria-label="Raccourcis">
        <Link href="/favorites" className={styles.quickLink}>
          <IconHeart /> Favoris & collections <IconChevronRight className={styles.chev} />
        </Link>
        <Link href="/itinerary" className={styles.quickLink}>
          <IconRoute /> Mes soirées <IconChevronRight className={styles.chev} />
        </Link>
        {user.role !== "user" ? (
          <Link href="/admin" className={styles.quickLink}>
            <IconSettings /> {user.role === "admin" ? "Administration" : "Curation"} <IconChevronRight className={styles.chev} />
          </Link>
        ) : null}
      </nav>

      <section className={styles.block} aria-labelledby="prefs-title">
        <div className={styles.blockHead}>
          <h2 id="prefs-title" className={styles.blockTitle}>
            Mes préférences
          </h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <span className="spinner" aria-hidden="true" /> : null}
            {dirty ? "Enregistrer" : "Enregistré"}
          </button>
        </div>
        <h3 className={styles.h3}>Catégories</h3>
        <CategoryTiles value={prefs.categories} onChange={(categories) => setPrefs({ ...prefs, categories })} />
        <h3 className={styles.h3}>Ambiances</h3>
        <AmbianceChips value={prefs.ambiances} onChange={(ambiances) => setPrefs({ ...prefs, ambiances })} />
        <h3 className={styles.h3}>Budget</h3>
        <BudgetPicker value={prefs.budget_max_fcfa} onChange={(budget_max_fcfa) => setPrefs({ ...prefs, budget_max_fcfa })} />
        <h3 className={styles.h3}>Ville habituelle</h3>
        <select className="select" style={{ maxWidth: 360 }} value={prefs.home_city ?? ""} onChange={(e) => setPrefs({ ...prefs, home_city: e.target.value || null })} aria-label="Ville habituelle">
          <option value="">Non précisée</option>
          {cities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      <section className={styles.block} aria-labelledby="privacy-title">
        <h2 id="privacy-title" className={styles.blockTitle}>
          Confidentialité
        </h2>
        <div className={styles.setting}>
          <span className={styles.settingIcon}>
            <IconLocate />
          </span>
          <div className={styles.settingText}>
            <strong>Utiliser ma position</strong>
            <p className="subtle">Pour trier par proximité et afficher les distances à vol d&apos;oiseau. Jamais partagée.</p>
            {gpsStatus === "denied" ? <p className="form-error" style={{ marginTop: 8 }}>Le navigateur bloque l&apos;accès à la position.</p> : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={consentOn}
            aria-label="Utiliser ma position"
            className={styles.switch}
            onClick={() => (consentOn ? declineGps() : acceptGps())}
          >
            <span />
          </button>
        </div>
        <div className={styles.setting}>
          <span className={styles.settingIcon}>
            <IconDownload />
          </span>
          <div className={styles.settingText}>
            <strong>Exporter mes données</strong>
            <p className="subtle">Un fichier JSON avec votre profil, vos favoris, collections, avis et soirées.</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={exportData} disabled={exporting}>
            {exporting ? <span className="spinner" aria-hidden="true" /> : <IconDownload />} Exporter
          </button>
        </div>
        <div className={styles.setting}>
          <span className={`${styles.settingIcon} ${styles.danger}`}>
            <IconTrash />
          </span>
          <div className={styles.settingText}>
            <strong>Supprimer mon compte</strong>
            <p className="subtle">Suppression définitive de votre compte et de toutes vos données.</p>
          </div>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setDelOpen(true)}>
            Supprimer
          </button>
        </div>
      </section>

      <button type="button" className="btn btn-block btn-lg" onClick={() => { logout(); toast("Vous êtes déconnecté.", "info"); router.push("/"); }}>
        <IconLogout /> Se déconnecter
      </button>
      <p className={styles.shield}>
        <IconShield size={14} /> Vos données restent les vôtres : export et suppression en un clic.
      </p>

      <Modal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Supprimer définitivement ?"
        description="Cette action est irréversible : favoris, collections, avis et soirées seront effacés."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDelOpen(false)}>
              Annuler
            </button>
            <button type="button" className="btn btn-danger" onClick={deleteAccount} disabled={confirm.trim().toUpperCase() !== "SUPPRIMER" || deleting}>
              {deleting ? <span className="spinner" aria-hidden="true" /> : <IconTrash />} Supprimer mon compte
            </button>
          </>
        }
      >
        <label className="field">
          <span className="label">Tapez SUPPRIMER pour confirmer</span>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </label>
      </Modal>
    </>
  );
}

export default function MePage() {
  return (
    <div className="page page-narrow">
      <title>Mon compte</title>
      <RequireAuth title="Votre espace" reason={<p>Connectez-vous pour gérer vos préférences, votre offre et vos données.</p>}>
        <Profile />
      </RequireAuth>
    </div>
  );
}
