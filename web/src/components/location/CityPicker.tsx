"use client";

import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { DEFAULT_CITY } from "@/lib/config";
import styles from "./Location.module.css";

/** Choix d'une ville et d'un quartier (repli quand la position n'est pas partagée). */
export function CityPicker({ onPick }: { onPick?: () => void }) {
  const { cities } = useMeta();
  const { city, district, setCity } = useLocation();
  const current = cities.find((c) => c.slug === city) ?? cities.find((c) => c.slug === DEFAULT_CITY) ?? cities[0];

  return (
    <div className={styles.picker}>
      <label className="field">
        <span className="label">Ville</span>
        <select
          className="select"
          value={current?.slug ?? city}
          onChange={(e) => setCity(e.target.value, null)}
          disabled={!cities.length}
        >
          {cities.length ? (
            cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))
          ) : (
            <option value={city}>Abidjan</option>
          )}
        </select>
      </label>
      {current?.districts?.length ? (
        <fieldset className={styles.districts}>
          <legend className="label">Quartier</legend>
          <div className="chip-wrap">
            <button
              type="button"
              className="chip"
              aria-pressed={district === null}
              onClick={() => {
                setCity(current.slug, null);
                onPick?.();
              }}
            >
              Toute la ville
            </button>
            {current.districts.map((d) => (
              <button
                key={d.slug}
                type="button"
                className="chip"
                aria-pressed={district === d.slug}
                onClick={() => {
                  setCity(current.slug, d.slug);
                  onPick?.();
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
