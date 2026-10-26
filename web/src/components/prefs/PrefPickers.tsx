"use client";

import { useMeta } from "@/context/MetaContext";
import { toggleIn } from "@/lib/filters";
import { formatFcfa } from "@/lib/format";
import { CategoryIcon, IconCheck } from "../icons";
import styles from "./PrefPickers.module.css";

export function CategoryTiles({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { categories, status } = useMeta();
  if (status === "loading" && !categories.length) {
    return (
      <div className={styles.tiles}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 92, borderRadius: 18 }} />
        ))}
      </div>
    );
  }
  return (
    <div className={styles.tiles} role="group" aria-label="Catégories préférées">
      {categories.map((c) => {
        const on = value.includes(c.slug);
        return (
          <button key={c.slug} type="button" className={styles.tile} aria-pressed={on} onClick={() => onChange(toggleIn(value, c.slug))}>
            <span className={styles.tileIcon}>
              <CategoryIcon slug={c.slug} icon={c.icon} size={24} />
            </span>
            <span className={styles.tileName}>{c.name}</span>
            <span className={styles.check} aria-hidden="true">
              <IconCheck size={14} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AmbianceChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { ambiances } = useMeta();
  return (
    <div className="chip-wrap" role="group" aria-label="Ambiances préférées">
      {ambiances.map((a) => (
        <button key={a.slug} type="button" className="chip" aria-pressed={value.includes(a.slug)} onClick={() => onChange(toggleIn(value, a.slug))}>
          {a.name}
        </button>
      ))}
    </div>
  );
}

const PRESETS = [
  { v: 5000, label: "Petit budget" },
  { v: 15000, label: "Raisonnable" },
  { v: 30000, label: "On se fait plaisir" },
  { v: 60000, label: "Grand soir" },
];

export function BudgetPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className={styles.budget}>
      <div className={styles.budgetValue} aria-live="polite">
        {value ? (
          <>
            jusqu&apos;à <strong>{formatFcfa(value)}</strong> <span className="subtle">par personne</span>
          </>
        ) : (
          <strong>Pas de limite</strong>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={100000}
        step={2500}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value) || null)}
        aria-label="Budget maximum par personne en FCFA"
        aria-valuetext={value ? formatFcfa(value) : "Pas de limite"}
      />
      <div className={styles.presets}>
        {PRESETS.map((p) => (
          <button key={p.v} type="button" className={styles.preset} aria-pressed={value === p.v} onClick={() => onChange(value === p.v ? null : p.v)}>
            <strong>{p.label}</strong>
            <span>≤ {formatFcfa(p.v)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
