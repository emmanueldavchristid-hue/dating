"use client";

import { useEffect, useState } from "react";
import { AuditTab, CurationTab, PlacesTab, ReportsTab, UsersTab } from "@/components/admin/Tabs";
import { IconChart, IconFlag, IconGem, IconHistory, IconLock, IconMap, IconUsers } from "@/components/icons";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { EmptyState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { groupThousands } from "@/lib/format";
import type { AdminStats } from "@/lib/types";
import styles from "./adminPage.module.css";

type TabKey = "places" | "users" | "reports" | "curation" | "audit";

const TABS: { key: TabKey; label: string; Icon: (p: { size?: number }) => React.JSX.Element; adminOnly: boolean }[] = [
  { key: "places", label: "Lieux", Icon: IconMap, adminOnly: true },
  { key: "users", label: "Utilisateurs", Icon: IconUsers, adminOnly: true },
  { key: "reports", label: "Signalements", Icon: IconFlag, adminOnly: true },
  { key: "curation", label: "Curation", Icon: IconGem, adminOnly: false },
  { key: "audit", label: "Journal d'audit", Icon: IconHistory, adminOnly: true },
];

const STAT_LABELS: Record<string, string> = {
  places: "Lieux",
  places_published: "Publiés",
  gems: "Pépites",
  demo_places: "Lieux démo",
  users: "Utilisateurs",
  premium_users: "Abonnés premium",
  open_reports: "Signalements ouverts",
  pending_curation: "En curation",
};

function Console() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = isAdmin || user?.role === "curator";
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  const [tab, setTab] = useState<TabKey>(isAdmin ? "places" : "curation");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    if (!isStaff) return;
    api.admin
      .stats()
      .then(setStats)
      .catch(() => setStatsError(true));
  }, [isStaff]);

  if (!isStaff) {
    return (
      <EmptyState icon={<IconLock />} title="Accès réservé à l'équipe">
        <p>Cet espace est réservé aux administrateurs et curateurs.</p>
      </EmptyState>
    );
  }

  const statEntries = stats ? Object.entries(stats).filter(([, v]) => typeof v === "number") : [];

  return (
    <>
      <section className={styles.stats} aria-label="Statistiques">
        {stats
          ? statEntries.map(([k, v]) => (
              <div key={k} className={`${styles.stat} ${k === "open_reports" && (v as number) > 0 ? styles.statAlert : ""} ${k === "gems" || k === "pending_curation" ? styles.statGold : ""}`}>
                <span className={styles.statValue}>{groupThousands(v as number)}</span>
                <span className={styles.statLabel}>{STAT_LABELS[k] ?? k.replace(/_/g, " ")}</span>
              </div>
            ))
          : statsError
            ? <p className="subtle">Statistiques indisponibles.</p>
            : Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 86, borderRadius: 18 }} />)}
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Sections d'administration">
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={styles.tab} onClick={() => setTab(key)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tabs.find((t) => t.key === tab)?.label}>
        {tab === "places" ? <PlacesTab /> : tab === "users" ? <UsersTab /> : tab === "reports" ? <ReportsTab /> : tab === "curation" ? <CurationTab /> : <AuditTab />}
      </div>
    </>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  return (
    <div className={`page ${styles.page}`}>
      <title>Administration</title>
      <div className="page-head">
        <p className="eyebrow">
          <IconChart size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> Console
        </p>
        <h1 className="page-title">{user?.role === "curator" ? "Curation" : "Administration"}</h1>
      </div>
      <RequireAuth title="Espace équipe">
        <Console />
      </RequireAuth>
    </div>
  );
}
