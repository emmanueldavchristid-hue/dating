"use client";

import { useEffect, useState } from "react";
import { useMeta } from "@/context/MetaContext";
import { api, errorMessage } from "@/lib/api";
import { toggleIn } from "@/lib/filters";
import type { AdminPlace, AdminPlaceInput, Tier } from "@/lib/types";
import { CategoryIcon } from "../icons";
import { Modal } from "../ui/Modal";
import { PhotoManager } from "./PhotoManager";
import styles from "./admin.module.css";

interface FormState {
  name: string;
  slug: string;
  city: string;
  district: string;
  lat: string;
  lng: string;
  categories: string[];
  ambiances: string[];
  budgetMin: string;
  budgetMax: string;
  tier: Tier;
  status: NonNullable<AdminPlaceInput["status"]>;
  shortDescription: string;
  description: string;
}

const EMPTY: FormState = {
  name: "",
  slug: "",
  city: "abidjan",
  district: "",
  lat: "",
  lng: "",
  categories: [],
  ambiances: [],
  budgetMin: "",
  budgetMax: "",
  tier: "free",
  status: "published",
  shortDescription: "",
  description: "",
};

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\s/g, "").replace(",", ".")));

/** Création / édition d'un lieu (admin). */
export function PlaceForm({ open, onClose, place, onSaved }: { open: boolean; onClose: () => void; place: AdminPlace | null; onSaved: (p: AdminPlace) => void }) {
  const { categories, ambiances, cities } = useMeta();
  const [f, setF] = useState<FormState>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!place) {
      setF(EMPTY);
      setSlugTouched(false);
      return;
    }
    // La ligne admin donne ville/quartier par nom : on les ramène à des slugs.
    const city = cities.find((c) => c.slug === place.city || c.name === place.city);
    const district = city?.districts.find((d) => d.slug === place.district || d.name === place.district);
    const base: FormState = {
      ...EMPTY,
      name: place.name,
      slug: place.slug,
      city: city?.slug ?? "",
      district: district?.slug ?? "",
      categories: place.categories ?? [],
      ambiances: place.ambiances ?? [],
      budgetMin: place.budget_min_fcfa != null ? String(place.budget_min_fcfa) : "",
      budgetMax: place.budget_max_fcfa != null ? String(place.budget_max_fcfa) : "",
      tier: place.tier,
      status: (place.status as FormState["status"]) ?? "published",
      shortDescription: place.short_description ?? "",
      description: place.description ?? "",
      lat: place.lat != null ? String(place.lat) : place.location ? String(place.location.lat) : "",
      lng: place.lng != null ? String(place.lng) : place.location ? String(place.location.lng) : "",
    };
    setF(base);
    setSlugTouched(true);
    // Coordonnées et description complète depuis la fiche publique
    setLoading(true);
    api.places
      .get(place.slug)
      .then((d) =>
        setF((cur) => ({
          ...cur,
          lat: cur.lat || (d.location ? String(d.location.lat) : ""),
          lng: cur.lng || (d.location ? String(d.location.lng) : ""),
          description: cur.description || d.description || "",
        })),
      )
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, place, cities]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const city = cities.find((c) => c.slug === f.city);
  const lat = num(f.lat);
  const lng = num(f.lng);
  const latOk = lat != null && Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const lngOk = lng != null && Number.isFinite(lng) && lng >= -180 && lng <= 180;
  const bmin = num(f.budgetMin);
  const bmax = num(f.budgetMax);
  const budgetOk = bmin == null || bmax == null || bmin <= bmax;
  const valid = f.name.trim() && f.city && f.categories.length > 0 && budgetOk && (place ? (f.lat === "" && f.lng === "") || (latOk && lngOk) : latOk && lngOk);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const body: AdminPlaceInput = {
      name: f.name.trim(),
      slug: f.slug.trim() || undefined,
      city: f.city,
      district: f.district || null,
      lat: lat as number,
      lng: lng as number,
      categories: f.categories,
      ambiances: f.ambiances,
      budget_min_fcfa: bmin,
      budget_max_fcfa: bmax,
      tier: f.tier,
      status: f.status,
      short_description: f.shortDescription.trim(),
      description: f.description.trim(),
    };
    try {
      if (place) {
        const patch: Partial<AdminPlaceInput> = { ...body };
        if (!(latOk && lngOk)) {
          delete patch.lat;
          delete patch.lng;
        }
        onSaved(await api.admin.updatePlace(place.id, patch));
      } else {
        onSaved(await api.admin.createPlace(body));
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={place ? `Modifier « ${place.name} »` : "Nouveau lieu"}
      variant="sheet"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="place-form" className="btn btn-primary" disabled={!valid || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {place ? "Enregistrer" : "Créer le lieu"}
          </button>
        </>
      }
    >
      <form id="place-form" onSubmit={submit} className={styles.form}>
        <label className="field">
          <span className="label">Nom *</span>
          <input
            className="input"
            required
            maxLength={160}
            value={f.name}
            onChange={(e) => setF((s) => ({ ...s, name: e.target.value, slug: slugTouched ? s.slug : slugify(e.target.value) }))}
          />
        </label>
        <label className="field">
          <span className="label">Slug (URL)</span>
          <input
            className="input"
            value={f.slug}
            pattern="[a-z0-9-]+"
            maxLength={160}
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value.toLowerCase());
            }}
          />
          <span className="hint">Minuscules, chiffres et tirets.</span>
        </label>
        <div className={styles.two}>
          <label className="field">
            <span className="label">Ville *</span>
            <select className="select" value={f.city} onChange={(e) => setF((s) => ({ ...s, city: e.target.value, district: "" }))} required>
              <option value="">Choisir…</option>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Quartier</span>
            <select className="select" value={f.district} onChange={(e) => set("district", e.target.value)} disabled={!city?.districts.length}>
              <option value="">—</option>
              {city?.districts.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.two}>
          <label className="field">
            <span className="label">Latitude {place ? "" : "*"}</span>
            <input className="input" inputMode="decimal" value={f.lat} onChange={(e) => set("lat", e.target.value)} placeholder={loading ? "Chargement…" : "5.3364"} aria-invalid={f.lat !== "" && !latOk} />
          </label>
          <label className="field">
            <span className="label">Longitude {place ? "" : "*"}</span>
            <input className="input" inputMode="decimal" value={f.lng} onChange={(e) => set("lng", e.target.value)} placeholder={loading ? "Chargement…" : "-4.0267"} aria-invalid={f.lng !== "" && !lngOk} />
          </label>
        </div>
        <fieldset className={styles.fieldset}>
          <legend className="label">Catégories *</legend>
          <div className="chip-wrap">
            {categories.map((c) => (
              <button key={c.slug} type="button" className="chip" aria-pressed={f.categories.includes(c.slug)} onClick={() => set("categories", toggleIn(f.categories, c.slug))}>
                <CategoryIcon slug={c.slug} icon={c.icon} />
                {c.name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend className="label">Ambiances</legend>
          <div className="chip-wrap">
            {ambiances.map((a) => (
              <button key={a.slug} type="button" className="chip" aria-pressed={f.ambiances.includes(a.slug)} onClick={() => set("ambiances", toggleIn(f.ambiances, a.slug))}>
                {a.name}
              </button>
            ))}
          </div>
        </fieldset>
        <div className={styles.two}>
          <label className="field">
            <span className="label">Budget min (FCFA)</span>
            <input className="input" inputMode="numeric" value={f.budgetMin} onChange={(e) => set("budgetMin", e.target.value.replace(/[^\d]/g, ""))} />
          </label>
          <label className="field">
            <span className="label">Budget max (FCFA)</span>
            <input className="input" inputMode="numeric" value={f.budgetMax} onChange={(e) => set("budgetMax", e.target.value.replace(/[^\d]/g, ""))} aria-invalid={!budgetOk} />
          </label>
        </div>
        {!budgetOk ? <p className="form-error">Le budget minimum dépasse le maximum.</p> : null}
        <div className={styles.two}>
          <label className="field">
            <span className="label">Niveau</span>
            <select className="select" value={f.tier} onChange={(e) => set("tier", e.target.value as Tier)}>
              <option value="free">Standard</option>
              <option value="premium">Pépite (premium)</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Statut</span>
            <select className="select" value={f.status} onChange={(e) => set("status", e.target.value as FormState["status"])}>
              <option value="published">Publié</option>
              <option value="draft">Brouillon</option>
              <option value="closed">Fermé</option>
              <option value="archived">Archivé</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span className="label">Accroche</span>
          <input className="input" maxLength={280} value={f.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Description</span>
          <textarea className="textarea" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      {/* Hors du <form> : l'envoi de photo est indépendant de l'enregistrement de la fiche. */}
      {place ? <PhotoManager placeId={place.id} slug={place.slug} /> : null}
    </Modal>
  );
}
