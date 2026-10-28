import type { OpenStatus, Plan, Travel } from "./types";

const NBSP = " ";

/** Groupe les milliers avec une espace insécable : 15000 → "15 000". */
export function groupThousands(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 15000 → "15 000 FCFA" (espaces insécables). */
export function formatFcfa(n: number): string {
  return `${groupThousands(n)}${NBSP}FCFA`;
}

/** Fourchette de budget ; null si inconnue (ne jamais inventer). */
export function formatBudgetRange(min: number | null, max: number | null): string | null {
  if (min != null && max != null) {
    if (max === 0) return "Gratuit";
    if (min === max) return formatFcfa(min);
    if (min === 0) return `Gratuit – ${formatFcfa(max)}`;
    return `${groupThousands(min)} – ${formatFcfa(max)}`;
  }
  if (min != null) return `Dès ${formatFcfa(min)}`;
  if (max != null) return `Jusqu'à ${formatFcfa(max)}`;
  return null;
}

/** Niveau de prix lisible ("Abordable", "Modéré", "Chic", "Haut de gamme"), ou null. */
const PRICE_LEVELS = ["Abordable", "Modéré", "Chic", "Haut de gamme"];
export function priceLevelLabel(level: number | null): string | null {
  if (level == null || level < 1) return null;
  return PRICE_LEVELS[Math.min(4, Math.round(level)) - 1] ?? null;
}

function frDecimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace(".", ",");
}

/** Distance à vol d'oiseau, toujours étiquetée comme telle. */
export function formatDistance(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  if (km < 1) {
    const m = Math.max(10, Math.round((km * 1000) / 10) * 10);
    return `${m}${NBSP}m`;
  }
  if (km < 10) return `${frDecimal(km)}${NBSP}km`;
  return `${Math.round(km)}${NBSP}km`;
}

export function distanceLabel(km: number | null | undefined): string | null {
  const d = formatDistance(km);
  return d ? `${d} à vol d'oiseau` : null;
}

/** Temps de trajet : uniquement si fourni par un service d'itinéraire. */
export function travelLabel(travel: Travel | null | undefined): string | null {
  if (!travel) return null;
  const mode = travel.mode === "walking" ? "à pied" : "en voiture";
  const mins = Math.max(1, Math.round(travel.minutes));
  const duration = mins >= 60 ? `${Math.floor(mins / 60)}${NBSP}h${String(mins % 60).padStart(2, "0")}` : `${mins}${NBSP}min`;
  return `${duration} ${mode}`;
}

export function openStatusLabel(status: OpenStatus, closesAt?: string | null): string {
  switch (status) {
    case "open":
      return closesAt ? `Ouvert · ferme à ${closesAt}` : "Ouvert";
    case "closed":
      return "Fermé";
    default:
      return "Horaires non vérifiés";
  }
}

export function formatRating(avg: number | null, count: number): string {
  if (avg == null || count <= 0) return "Pas encore d'avis";
  return `${frDecimal(avg)} (${count}${NBSP}avis)`;
}

export function confidenceLabel(confidence: number): { label: string; level: "high" | "medium" | "low" } {
  if (confidence >= 0.8) return { label: "Élevée", level: "high" };
  if (confidence >= 0.5) return { label: "Moyenne", level: "medium" };
  return { label: "Faible", level: "low" };
}

export const WEEKDAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

export function formatDate(iso: string | null | undefined, withTime = false): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Découverte",
  plus: "Plus",
  insider: "Insider",
};

export function planLabel(plan: Plan | string): string {
  return PLAN_LABELS[plan as Plan] ?? plan;
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${groupThousands(n)} ${n > 1 ? plural ?? `${singular}s` : singular}`;
}

/** En dessous, l'affinité n'est pas mise en avant (une pastille « 9 % pour toi » n'aide personne). */
export const MATCH_MIN = 50;

/** "92 % pour toi" — uniquement si le serveur fournit une affinité (jamais calculée côté client). */
export function matchLabel(match: number | null | undefined): string | null {
  if (match == null || !Number.isFinite(match)) return null;
  const m = Math.max(0, Math.min(100, Math.round(match)));
  if (m < MATCH_MIN) return null;
  return `${m}${NBSP}% pour toi`;
}

/** Initiales d'un nom affichable (avatar). */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Question en langage naturel → concierge ; requête courte → recherche. */
export function isNaturalQuery(q: string): boolean {
  const t = q.trim();
  if (!t) return false;
  return t.split(/\s+/).filter(Boolean).length >= 4 || /\?$/.test(t);
}

/** Distance orthodromique (km) — même calcul « à vol d'oiseau » que le serveur. */
export function haversineKm(a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null): number | null {
  if (!a || !b) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 10) / 10;
}
