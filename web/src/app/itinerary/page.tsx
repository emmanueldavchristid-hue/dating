"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CategoryIcon, IconCalendar, IconChevronDown, IconChevronRight, IconChevronUp, IconCrown, IconLock, IconRoute, IconSparkle, IconTrash, IconX } from "@/components/icons";
import { Timeline, type TimelineStep } from "@/components/itinerary/Timeline";
import { Modal } from "@/components/ui/Modal";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { useToast } from "@/context/ToastContext";
import { ApiError, api, errorMessage } from "@/lib/api";
import { toggleIn } from "@/lib/filters";
import { formatBudgetRange, formatDate, formatFcfa, haversineKm, planLabel } from "@/lib/format";
import type { ItinerarySummary, Plan, PlaceCard, SuggestResponse } from "@/lib/types";
import styles from "./itinerary.module.css";

const FALLBACK_MAX: Record<Plan, number> = { free: 2, plus: 4, insider: 5 };

interface Draft {
  key: string;
  place: PlaceCard;
  startTime: string;
  note: string;
}

function withLegs(steps: Draft[]): TimelineStep[] {
  return steps.map((s, i) => ({
    key: s.key,
    place: s.place,
    legKm: i === 0 ? null : haversineKm(steps[i - 1].place.location, s.place.location),
    startTime: s.startTime || null,
    note: s.note || null,
  }));
}

function Builder() {
  const { user } = useAuth();
  const { categories } = useMeta();
  const { originParams } = useLocation();
  const toast = useToast();
  const router = useRouter();
  const [maxSteps, setMaxSteps] = useState(FALLBACK_MAX[user?.plan ?? "free"]);
  const [count, setCount] = useState(2);
  const [cats, setCats] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<SuggestResponse | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [title, setTitle] = useState("Ma soirée");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ItinerarySummary[] | null>(null);
  const [savedError, setSavedError] = useState<unknown>(null);
  const [toDelete, setToDelete] = useState<ItinerarySummary | null>(null);

  useEffect(() => {
    api.billing
      .plans()
      .then((plans) => {
        const p = plans.find((x) => x.code === user?.plan);
        if (p) setMaxSteps(p.quotas.itinerary_max_steps);
      })
      .catch(() => undefined);
  }, [user?.plan]);

  const loadSaved = useCallback(() => {
    setSavedError(null);
    api.itineraries.list().then(setSaved).catch(setSavedError);
  }, []);
  useEffect(loadSaved, [loadSaved]);

  const suggest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const b = Number(budget.replace(/\s/g, ""));
      const res = await api.itineraries.suggest({
        ...originParams,
        steps: count,
        categories: cats.length ? cats : undefined,
        budget_max_fcfa: b > 0 ? b : undefined,
      });
      setResult(res);
      setDraft(res.steps.map((s, i) => ({ key: `${s.place.id}-${i}`, place: s.place, startTime: "", note: "" })));
    } catch (err) {
      setError(err);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const n = [...d];
      const j = i + dir;
      if (j < 0 || j >= n.length) return d;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const patch = (i: number, p: Partial<Draft>) => setDraft((d) => d.map((s, k) => (k === i ? { ...s, ...p } : s)));

  const save = async () => {
    setSaving(true);
    try {
      const it = await api.itineraries.create(
        title.trim() || "Ma soirée",
        draft.map((s) => ({ place_id: s.place.id, ...(s.startTime ? { start_time: s.startTime } : {}), ...(s.note.trim() ? { note: s.note.trim() } : {}) })),
        date || undefined,
      );
      toast("Soirée enregistrée", "success");
      router.push(`/itinerary/${encodeURIComponent(it.id)}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await api.itineraries.remove(toDelete.id);
      setSaved((l) => l?.filter((x) => x.id !== toDelete.id) ?? null);
      toast("Soirée supprimée", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setToDelete(null);
    }
  };

  const lockedSteps = draft.some((s) => s.place.locked);
  const total = result ? formatBudgetRange(result.total_budget_min_fcfa, result.total_budget_max_fcfa) : null;

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <form className={styles.form} onSubmit={suggest}>
          <h2 className={styles.formTitle}>
            <IconSparkle /> Suggérer une soirée
          </h2>
          <fieldset className={styles.group}>
            <legend className="label">Nombre d&apos;étapes</legend>
            <div className={styles.segment} role="radiogroup" aria-label="Nombre d'étapes">
              {[2, 3, 4, 5].map((n) => {
                const locked = n > maxSteps;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={count === n}
                    className={styles.segBtn}
                    onClick={() => setCount(n)}
                    disabled={locked}
                    title={locked ? `Jusqu'à ${maxSteps} étapes avec l'offre ${planLabel(user?.plan ?? "free")}` : undefined}
                  >
                    {n}
                    {locked ? <IconLock size={12} /> : null}
                  </button>
                );
              })}
            </div>
            {maxSteps < 5 ? (
              <p className="hint">
                Offre {planLabel(user?.plan ?? "free")} : {maxSteps} étapes max.{" "}
                <Link href="/premium" className="link">
                  Plus d&apos;étapes
                </Link>
              </p>
            ) : null}
          </fieldset>
          <fieldset className={styles.group}>
            <legend className="label">Envies (facultatif)</legend>
            <div className="chip-wrap">
              {categories.map((c) => (
                <button key={c.slug} type="button" className="chip" aria-pressed={cats.includes(c.slug)} onClick={() => setCats(toggleIn(cats, c.slug))}>
                  <CategoryIcon slug={c.slug} icon={c.icon} />
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span className="label">Budget max par étape (FCFA)</span>
            <input
              className="input"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^\d\s]/g, ""))}
              placeholder="Ex. 15000"
            />
            {Number(budget.replace(/\s/g, "")) > 0 ? <span className="hint">{formatFcfa(Number(budget.replace(/\s/g, "")))}</span> : null}
          </label>
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <IconRoute />}
            {busy ? "Composition…" : "Composer ma soirée"}
          </button>
        </form>

        <section className={styles.savedBox} aria-labelledby="saved-title">
          <h2 id="saved-title" className={styles.formTitle}>
            <IconCalendar /> Mes soirées
          </h2>
          {savedError ? (
            <ErrorState error={savedError} onRetry={loadSaved} compact />
          ) : !saved ? (
            <div className="skeleton" style={{ height: 80 }} />
          ) : saved.length === 0 ? (
            <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              Aucune soirée enregistrée pour l&apos;instant.
            </p>
          ) : (
            <ul className={styles.savedList}>
              {saved.map((s) => {
                const n = s.step_count ?? s.steps_count ?? s.count ?? s.steps?.length;
                return (
                  <li key={s.id} className={styles.savedItem}>
                    <Link href={`/itinerary/${encodeURIComponent(s.id)}`} className={styles.savedLink}>
                      <strong>{s.title}</strong>
                      <span className="subtle">
                        {s.date ? formatDate(s.date) : "Sans date"}
                        {n != null ? ` · ${n} étape${n > 1 ? "s" : ""}` : ""}
                      </span>
                    </Link>
                    <button type="button" className="icon-btn icon-btn-sm" onClick={() => setToDelete(s)} aria-label={`Supprimer ${s.title}`}>
                      <IconTrash />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className={styles.right}>
        {error ? (
          error instanceof ApiError && error.kind === "premium" ? (
            <EmptyState
              icon={<IconCrown />}
              title="Plus d'étapes avec Plus et Insider"
              tone="gold"
              action={
                <Link href="/premium" className="btn btn-gold">
                  Voir les offres
                </Link>
              }
            >
              <p>{error.detail}</p>
            </EmptyState>
          ) : (
            <ErrorState error={error} />
          )
        ) : busy ? (
          <div className="stack" aria-busy="true">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 104, borderRadius: 20 }} />
            ))}
          </div>
        ) : !result ? (
          <EmptyState icon={<IconRoute />} title="Une soirée en plusieurs actes">
            <p>Apéro au coucher du soleil, dîner, puis un dernier verre : choisissez vos envies et on enchaîne les adresses les plus proches les unes des autres.</p>
          </EmptyState>
        ) : draft.length === 0 ? (
          <EmptyState icon={<IconRoute />} title="Aucune combinaison trouvée">
            <p>Essayez moins d&apos;étapes, d&apos;autres catégories ou un budget plus large.</p>
          </EmptyState>
        ) : (
          <div className={styles.result}>
            <div className={styles.resultHead}>
              <div>
                <p className="eyebrow">Votre soirée</p>
                <p className={styles.resultMeta}>
                  {draft.length} étape{draft.length > 1 ? "s" : ""}
                  {total ? ` · ${total} par personne au total` : ""}
                </p>
              </div>
            </div>
            {result.notes.length ? (
              <ul className={styles.notes}>
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            <Timeline
              steps={withLegs(draft)}
              renderControls={(i) => (
                <>
                  <label className={styles.ctlField}>
                    <span>Heure</span>
                    <input type="time" className="input" value={draft[i].startTime} onChange={(e) => patch(i, { startTime: e.target.value })} />
                  </label>
                  <label className={`${styles.ctlField} ${styles.ctlNote}`}>
                    <span>Note</span>
                    <input className="input" value={draft[i].note} maxLength={280} placeholder="Réserver une table…" onChange={(e) => patch(i, { note: e.target.value })} />
                  </label>
                  <div className={styles.ctlBtns}>
                    <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Monter l'étape">
                      <IconChevronUp />
                    </button>
                    <button type="button" className="icon-btn icon-btn-sm" onClick={() => move(i, 1)} disabled={i === draft.length - 1} aria-label="Descendre l'étape">
                      <IconChevronDown />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}
                      disabled={draft.length <= 1}
                      aria-label="Retirer l'étape"
                      title={draft.length <= 1 ? "Une soirée compte au moins une étape" : undefined}
                    >
                      <IconX />
                    </button>
                  </div>
                </>
              )}
            />
            <div className={styles.saveBox}>
              <label className="field">
                <span className="label">Titre</span>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
              </label>
              <label className="field">
                <span className="label">Date (facultatif)</span>
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <button type="button" className="btn btn-primary btn-lg" onClick={save} disabled={saving || !draft.length || lockedSteps}>
                {saving ? <span className="spinner" aria-hidden="true" /> : <IconChevronRight />}
                Enregistrer la soirée
              </button>
              {lockedSteps ? <p className="hint">Retirez les pépites verrouillées pour enregistrer.</p> : null}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cette soirée ?"
        description={toDelete?.title}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToDelete(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-danger" onClick={remove}>
              <IconTrash /> Supprimer
            </button>
          </>
        }
      >
        <p className="muted">Cette action est définitive.</p>
      </Modal>
    </div>
  );
}

export default function ItineraryPage() {
  return (
    <div className="page">
      <title>Ma soirée</title>
      <div className="page-head">
        <p className="eyebrow">Ma soirée</p>
        <h1 className="page-title">Composer une sortie</h1>
        <p className="page-sub">Les distances entre étapes sont à vol d&apos;oiseau : comptez davantage sur la route.</p>
      </div>
      <RequireAuth title="Composez vos soirées" reason={<p>Connectez-vous pour générer et enregistrer des sorties en plusieurs étapes.</p>}>
        <Builder />
      </RequireAuth>
    </div>
  );
}
