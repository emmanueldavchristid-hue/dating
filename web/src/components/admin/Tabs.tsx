"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage, itemsOf } from "@/lib/api";
import { formatBudgetRange, formatDate, planLabel } from "@/lib/format";
import type { AdminPlace, AdminReport, AdminUser, AuditEntry, CurationItem, Paginated, Plan, ReportStatus, Role } from "@/lib/types";
import { IconCheck, IconEdit, IconExternal, IconGem, IconPlus, IconSearch, IconX } from "../icons";
import { Cover } from "../place/Cover";
import { EmptyState, ErrorState } from "../ui/States";
import { Pager } from "./Pager";
import { PlaceForm } from "./PlaceForm";
import styles from "./admin.module.css";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SearchBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className={styles.searchBox}>
      <IconSearch size={18} />
      <span className="sr-only">{label}</span>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} />
    </label>
  );
}

function TableSkeleton() {
  return <div className="skeleton" style={{ height: 280, borderRadius: 20 }} aria-busy="true" />;
}

const REPORT_KINDS: Record<string, string> = {
  closed: "Fermé définitivement",
  wrong_hours: "Horaires faux",
  wrong_location: "Position fausse",
  wrong_price: "Prix faux",
  other: "Autre",
};

const STATUS_LABEL: Record<string, string> = { published: "Publié", draft: "Brouillon", closed: "Fermé", archived: "Archivé" };

// ---------------------------------------------------------------- Lieux
export function PlacesTab() {
  const { categoryName } = useMeta();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminPlace> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<AdminPlace | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.admin.places(dq, page).then(setData).catch(setError);
  }, [dq, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [dq]);

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <SearchBox value={q} onChange={setQ} label="Rechercher un lieu (nom, slug)" />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <IconPlus /> Nouveau lieu
        </button>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState title="Aucun lieu trouvé" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Lieu</th>
                  <th>Zone</th>
                  <th>Catégories</th>
                  <th>Budget</th>
                  <th>Statut</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className={styles.cellMain}>
                        <strong>{p.name}</strong>
                        <span className="subtle">/{p.slug}</span>
                      </div>
                    </td>
                    <td>{[p.district, p.city].filter(Boolean).join(", ")}</td>
                    <td className={styles.wrapCell}>{p.categories.map(categoryName).join(", ")}</td>
                    <td className="nowrap">{formatBudgetRange(p.budget_min_fcfa, p.budget_max_fcfa) ?? <span className="subtle">—</span>}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <span className="badge">{STATUS_LABEL[p.status ?? ""] ?? p.status ?? "—"}</span>
                        {p.tier === "premium" ? (
                          <span className="badge badge-gold">
                            <IconGem /> Pépite
                          </span>
                        ) : null}
                        {p.is_demo ? <span className="badge badge-demo">Démo</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                        <Link href={`/places/${encodeURIComponent(p.slug)}`} className="icon-btn icon-btn-sm" aria-label={`Voir la fiche de ${p.name}`} target="_blank">
                          <IconExternal />
                        </Link>
                        <button
                          type="button"
                          className="icon-btn icon-btn-sm"
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                          aria-label={`Modifier ${p.name}`}
                        >
                          <IconEdit />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
      <PlaceForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        place={editing}
        onSaved={(p) => {
          toast(editing ? "Lieu mis à jour" : "Lieu créé", "success");
          setData((d) => {
            if (!d) return d;
            const exists = d.items.some((x) => x.id === p.id);
            return { ...d, items: exists ? d.items.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [p, ...d.items], total: exists ? d.total : d.total + 1 };
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Utilisateurs
export function UsersTab() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.admin.users(dq, page).then(setData).catch(setError);
  }, [dq, page]);
  useEffect(load, [load]);
  useEffect(() => setPage(1), [dq]);

  const update = async (u: AdminUser, patch: { role?: Role; plan?: Plan }) => {
    setBusy(u.id);
    try {
      const res = await api.admin.updateUser(u.id, patch);
      setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === u.id ? { ...x, ...res } : x)) } : d));
      toast(`${u.display_name} mis à jour`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <SearchBox value={q} onChange={setQ} label="Rechercher (e-mail, nom)" />
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState title="Aucun utilisateur trouvé" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Utilisateur</th>
                  <th>Inscription</th>
                  <th>Rôle</th>
                  <th>Offre</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className={styles.cellMain}>
                          <strong>
                            {u.display_name} {self ? <span className="subtle">(vous)</span> : null}
                          </strong>
                          <span className="subtle">{u.email}</span>
                        </div>
                      </td>
                      <td className="nowrap">{formatDate(u.created_at) ?? "—"}</td>
                      <td>
                        <select
                          className={`select ${styles.smallSelect}`}
                          value={u.role}
                          onChange={(e) => update(u, { role: e.target.value as Role })}
                          disabled={busy === u.id || self}
                          title={self ? "Vous ne pouvez pas modifier votre propre rôle" : undefined}
                          aria-label={`Rôle de ${u.display_name}`}
                        >
                          <option value="user">Membre</option>
                          <option value="curator">Curateur</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <select
                          className={`select ${styles.smallSelect}`}
                          value={u.plan}
                          onChange={(e) => update(u, { plan: e.target.value as Plan })}
                          disabled={busy === u.id}
                          aria-label={`Offre de ${u.display_name}`}
                        >
                          {(["free", "plus", "insider"] as Plan[]).map((p) => (
                            <option key={p} value={p}>
                              {planLabel(p)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Signalements
export function ReportsTab() {
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus>("open");
  const [items, setItems] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setItems(null);
    api.admin
      .reports(status)
      .then((d) => setItems(itemsOf(d)))
      .catch(setError);
  }, [status]);
  useEffect(load, [load]);

  const decide = async (r: AdminReport, next: ReportStatus) => {
    setBusy(r.id);
    try {
      await api.admin.updateReport(r.id, next);
      setItems((l) => l?.filter((x) => x.id !== r.id) ?? null);
      toast(next === "resolved" ? "Signalement résolu" : next === "rejected" ? "Signalement rejeté" : "Signalement rouvert", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <div className="chip-wrap" role="radiogroup" aria-label="Statut">
          {(["open", "resolved", "rejected"] as ReportStatus[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} className="chip" onClick={() => setStatus(s)}>
              {s === "open" ? "Ouverts" : s === "resolved" ? "Résolus" : "Rejetés"}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !items ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconCheck />} title={status === "open" ? "Rien à traiter" : "Aucun signalement"}>
          {status === "open" ? <p>Tous les signalements ont été traités.</p> : null}
        </EmptyState>
      ) : (
        <ul className={styles.cards}>
          {items.map((r) => {
            const name = r.place?.name ?? r.place_name ?? r.place_id ?? "Lieu";
            const slug = r.place?.slug;
            return (
              <li key={r.id} className={styles.reportCard}>
                <div className={styles.reportHead}>
                  <span className="badge badge-accent">{REPORT_KINDS[r.kind] ?? r.kind}</span>
                  <span className="subtle">{formatDate(r.created_at, true)}</span>
                </div>
                <p className={styles.reportPlace}>
                  {slug ? (
                    <Link href={`/places/${encodeURIComponent(slug)}`} className="link" target="_blank">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </p>
                <p className={styles.reportMsg}>{r.message || <span className="subtle">Sans précision.</span>}</p>
                <div className="row wrap">
                  {status === "open" ? (
                    <>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => decide(r, "resolved")} disabled={busy === r.id}>
                        <IconCheck /> Résolu
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => decide(r, "rejected")} disabled={busy === r.id}>
                        <IconX /> Rejeter
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={() => decide(r, "open")} disabled={busy === r.id}>
                      Rouvrir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Curation
export function CurationTab() {
  const toast = useToast();
  const [items, setItems] = useState<CurationItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.admin
      .curation()
      .then((d) => setItems(itemsOf(d)))
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  const decide = async (c: CurationItem, decision: "approved" | "rejected") => {
    setBusy(c.id);
    try {
      await api.admin.decide(c.id, decision, notes[c.id]?.trim() || undefined);
      setItems((l) => l?.filter((x) => x.id !== c.id) ?? null);
      toast(decision === "approved" ? "Approuvé" : "Rejeté", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const REASONS: Record<string, string> = { gem_candidate: "Candidate pépite", verification: "Vérification", new_place: "Nouveau lieu" };

  return (
    <div className={styles.tab}>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !items ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconGem />} title="File de curation vide" tone="gold">
          <p>Aucune proposition en attente.</p>
        </EmptyState>
      ) : (
        <ul className={styles.cards}>
          {items.map((c) => {
            const p = c.place;
            return (
              <li key={c.id} className={styles.curCard}>
                {p ? <Cover cover={p.cover} category={p.categories[0]} size="thumb" className={styles.curThumb} /> : null}
                <div className={styles.curBody}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge badge-gold">
                      <IconGem /> {REASONS[c.reason ?? ""] ?? c.reason ?? "À examiner"}
                    </span>
                    {p?.is_demo ? <span className="badge badge-demo">Démo</span> : null}
                    <span className="subtle">{formatDate(c.created_at)}</span>
                  </div>
                  <p className={styles.reportPlace}>
                    {p ? (
                      <Link href={`/places/${encodeURIComponent(p.slug)}`} className="link" target="_blank">
                        {p.name}
                      </Link>
                    ) : (
                      c.place_name ?? "Lieu"
                    )}
                    {p?.district ? <span className="subtle"> · {p.district}</span> : null}
                  </p>
                  {c.detail ? <p className={styles.reportMsg}>{c.detail}</p> : null}
                  <label className="field">
                    <span className="sr-only">Note de décision</span>
                    <input
                      className="input"
                      placeholder="Note (facultatif)"
                      value={notes[c.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                      maxLength={500}
                    />
                  </label>
                  <div className="row wrap">
                    <button type="button" className="btn btn-sm btn-gold" onClick={() => decide(c, "approved")} disabled={busy === c.id}>
                      <IconCheck /> Approuver
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => decide(c, "rejected")} disabled={busy === c.id}>
                      <IconX /> Rejeter
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Audit
export function AuditTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    api.admin.audit(page).then(setData).catch(setError);
  }, [page]);
  useEffect(load, [load]);

  return (
    <div className={styles.tab}>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <TableSkeleton />
      ) : data.items.length === 0 ? (
        <EmptyState title="Journal vide" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Cible</th>
                  <th>Auteur</th>
                  <th>Détails</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={String(a.id)}>
                    <td className="nowrap">{formatDate(a.created_at, true)}</td>
                    <td>
                      <code className={styles.code}>{a.action}</code>
                    </td>
                    <td className="nowrap">
                      {a.entity_type ?? "—"} <span className="subtle">{a.entity_id ? `${String(a.entity_id).slice(0, 8)}…` : ""}</span>
                    </td>
                    <td className="subtle nowrap">{a.actor_id ? `${String(a.actor_id).slice(0, 8)}…` : "système"}</td>
                    <td className={styles.wrapCell}>
                      {a.data && typeof a.data === "object" && Object.keys(a.data as object).length ? (
                        <code className={styles.code}>{JSON.stringify(a.data)}</code>
                      ) : (
                        <span className="subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
