"use client";

import { useEffect, useState } from "react";
import { useMeta } from "@/context/MetaContext";
import { EMPTY_FILTERS, SORTS, countActiveFilters, toggleIn, type SearchFilters } from "@/lib/filters";
import { formatFcfa } from "@/lib/format";
import { CategoryIcon, IconStarFilled } from "../icons";
import { Modal } from "../ui/Modal";
import styles from "./FilterSheet.module.css";

const BUDGETS = [5000, 10000, 20000, 35000, 50000];
const DISTANCES = [1, 3, 5, 10, 20];
const RATINGS = [3, 3.5, 4, 4.5];

interface Props {
  open: boolean;
  onClose: () => void;
  value: SearchFilters;
  onApply: (f: SearchFilters) => void;
  /** Masquer le tri (carte). */
  hideSort?: boolean;
}

export function FilterSheet({ open, onClose, value, onApply, hideSort = false }: Props) {
  const { categories, ambiances, cities } = useMeta();
  const [draft, setDraft] = useState<SearchFilters>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const city = cities.find((c) => c.slug === draft.city);
  const active = countActiveFilters(draft);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filtres"
      variant="sheet"
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDraft({ ...EMPTY_FILTERS, q: draft.q, sort: draft.sort })}
            disabled={active === 0}
          >
            Réinitialiser
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            Appliquer{active ? ` (${active})` : ""}
          </button>
        </>
      }
    >
      <div className={styles.groups}>
        {!hideSort ? (
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Trier par</legend>
            <div className="chip-wrap" role="radiogroup" aria-label="Tri">
              {SORTS.map((s) => (
                <button key={s.value} type="button" role="radio" aria-checked={draft.sort === s.value} className="chip" onClick={() => set("sort", s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Catégories</legend>
          <div className="chip-wrap">
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                className="chip"
                aria-pressed={draft.categories.includes(c.slug)}
                onClick={() => set("categories", toggleIn(draft.categories, c.slug))}
              >
                <CategoryIcon slug={c.slug} icon={c.icon} />
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Ambiances</legend>
          <div className="chip-wrap">
            {ambiances.map((a) => (
              <button
                key={a.slug}
                type="button"
                className="chip"
                aria-pressed={draft.ambiances.includes(a.slug)}
                onClick={() => set("ambiances", toggleIn(draft.ambiances, a.slug))}
              >
                {a.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>
            Budget max par personne
            <span className={styles.legendValue}>{draft.budgetMax ? formatFcfa(draft.budgetMax) : "Sans limite"}</span>
          </legend>
          <input
            type="range"
            min={0}
            max={100000}
            step={2500}
            value={draft.budgetMax ?? 0}
            onChange={(e) => set("budgetMax", Number(e.target.value) || null)}
            aria-label="Budget maximum en FCFA"
            aria-valuetext={draft.budgetMax ? formatFcfa(draft.budgetMax) : "Sans limite"}
          />
          <div className="chip-wrap">
            {BUDGETS.map((b) => (
              <button key={b} type="button" className="chip" aria-pressed={draft.budgetMax === b} onClick={() => set("budgetMax", draft.budgetMax === b ? null : b)}>
                ≤ {formatFcfa(b)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Distance max (à vol d&apos;oiseau)</legend>
          <div className="chip-wrap">
            {DISTANCES.map((d) => (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={draft.maxDistanceKm === d}
                onClick={() => set("maxDistanceKm", draft.maxDistanceKm === d ? null : d)}
              >
                {d} km
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Note minimale</legend>
          <div className="chip-wrap">
            {RATINGS.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={draft.minRating === r} onClick={() => set("minRating", draft.minRating === r ? null : r)}>
                <IconStarFilled style={{ color: "var(--gold)" }} />
                {String(r).replace(".", ",")}+
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Pratique</legend>
          <label className="checkbox">
            <input type="checkbox" checked={draft.openNow} onChange={(e) => set("openNow", e.target.checked)} />
            Ouvert maintenant <span className="subtle">(horaires vérifiés uniquement)</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={draft.parking} onChange={(e) => set("parking", e.target.checked)} />
            Parking
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={draft.wheelchair} onChange={(e) => set("wheelchair", e.target.checked)} />
            Accessible en fauteuil roulant
          </label>
        </fieldset>

        <fieldset className={styles.group}>
          <legend className={styles.legend}>Zone</legend>
          <p className="hint">Par défaut : votre position ou votre ville de départ.</p>
          <div className={styles.zone}>
            <label className="field">
              <span className="label">Ville</span>
              <select className="select" value={draft.city ?? ""} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value || null, district: null }))}>
                <option value="">Ma position / ville de départ</option>
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Quartier</span>
              <select
                className="select"
                value={draft.district ?? ""}
                onChange={(e) => set("district", e.target.value || null)}
                disabled={!city?.districts.length}
                title={!city ? "Choisissez d'abord une ville" : undefined}
              >
                <option value="">{city ? "Toute la ville" : "Choisissez une ville"}</option>
                {city?.districts.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
