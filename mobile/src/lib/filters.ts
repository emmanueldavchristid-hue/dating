import type { Query } from "./api";
import { formatFcfa } from "./format";
import type { SortKey } from "./types";

export interface SearchFilters {
  q: string;
  categories: string[];
  ambiances: string[];
  budgetMax: number | null;
  openNow: boolean;
  maxDistanceKm: number | null;
  parking: boolean;
  wheelchair: boolean;
  minRating: number | null;
  sort: SortKey;
  city: string | null;
  district: string | null;
}

export const SORTS: { value: SortKey; label: string }[] = [
  { value: "relevance", label: "Pertinence" },
  { value: "distance", label: "Proximité" },
  { value: "popularity", label: "Popularité" },
  { value: "newest", label: "Nouveautés" },
];

export const EMPTY_FILTERS: SearchFilters = {
  q: "",
  categories: [],
  ambiances: [],
  budgetMax: null,
  openNow: false,
  maxDistanceKm: null,
  parking: false,
  wheelchair: false,
  minRating: null,
  sort: "relevance",
  city: null,
  district: null,
};

export type SearchOrigin = { kind: "gps"; lat: number; lng: number } | { kind: "city"; city: string; district: string | null };

/** Filtres + origine → paramètres de GET /places/search. */
export function filtersToApiQuery(f: SearchFilters, origin: SearchOrigin, page = 1, pageSize = 20): Query {
  const q: Query = {
    q: f.q.trim() || undefined,
    categories: f.categories,
    ambiances: f.ambiances,
    budget_max: f.budgetMax ?? undefined,
    open_now: f.openNow || undefined,
    max_distance_km: f.maxDistanceKm ?? undefined,
    parking: f.parking || undefined,
    wheelchair: f.wheelchair || undefined,
    min_rating: f.minRating ?? undefined,
    sort: f.sort,
    page,
    page_size: pageSize,
  };
  // Une ville choisie explicitement dans les filtres l'emporte sur la position.
  if (f.city) {
    q.city = f.city;
    q.district = f.district ?? undefined;
  } else if (origin.kind === "gps") {
    q.lat = origin.lat;
    q.lng = origin.lng;
  } else {
    q.city = origin.city;
    q.district = f.district ?? origin.district ?? undefined;
  }
  return q;
}

/** Nombre de filtres actifs (hors recherche texte et tri). */
export function countActiveFilters(f: SearchFilters): number {
  let n = 0;
  n += f.categories.length;
  n += f.ambiances.length;
  if (f.budgetMax) n++;
  if (f.openNow) n++;
  if (f.maxDistanceKm) n++;
  if (f.parking) n++;
  if (f.wheelchair) n++;
  if (f.minRating) n++;
  if (f.city) n++;
  if (f.district) n++;
  return n;
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export const BUDGET_PRESETS: { value: number; label: string }[] = [
  { value: 5000, label: "5 000" },
  { value: 10000, label: "10 000" },
  { value: 20000, label: "20 000" },
  { value: 40000, label: "40 000" },
];
export const DISTANCE_PRESETS = [2, 5, 10, 20];
export const RATING_PRESETS = [3, 3.5, 4, 4.5];

/** Étiquettes des filtres actifs, pour les puces retirables. */
export type ActiveChip = { key: string; label: string; remove: (f: SearchFilters) => SearchFilters };

export function activeFilterChips(
  f: SearchFilters,
  names: { categories: Record<string, string>; ambiances: Record<string, string> },
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const c of f.categories)
    chips.push({ key: `c:${c}`, label: names.categories[c] ?? c, remove: (x) => ({ ...x, categories: x.categories.filter((v) => v !== c) }) });
  for (const a of f.ambiances)
    chips.push({ key: `a:${a}`, label: names.ambiances[a] ?? a, remove: (x) => ({ ...x, ambiances: x.ambiances.filter((v) => v !== a) }) });
  if (f.budgetMax) chips.push({ key: "budget", label: `≤ ${formatFcfa(f.budgetMax)}`, remove: (x) => ({ ...x, budgetMax: null }) });
  if (f.openNow) chips.push({ key: "open", label: "Ouvert maintenant", remove: (x) => ({ ...x, openNow: false }) });
  if (f.maxDistanceKm) chips.push({ key: "dist", label: `≤ ${f.maxDistanceKm} km`, remove: (x) => ({ ...x, maxDistanceKm: null }) });
  if (f.parking) chips.push({ key: "parking", label: "Parking", remove: (x) => ({ ...x, parking: false }) });
  if (f.wheelchair) chips.push({ key: "pmr", label: "Accès PMR", remove: (x) => ({ ...x, wheelchair: false }) });
  if (f.minRating) chips.push({ key: "rating", label: `Note ≥ ${String(f.minRating).replace(".", ",")}`, remove: (x) => ({ ...x, minRating: null }) });
  return chips;
}
