import type { Query } from "./api";
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

const SORT_VALUES = new Set<SortKey>(["relevance", "distance", "popularity", "newest"]);

function list(v: string | null): string[] {
  if (!v) return [];
  return Array.from(new Set(v.split(",").map((s) => s.trim()).filter(Boolean)));
}
function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function bool(v: string | null): boolean {
  return v === "1" || v === "true";
}

/** URL de la page (/search?…) → filtres. Tolérant aux valeurs invalides. */
export function filtersFromQuery(params: URLSearchParams | { get(name: string): string | null }): SearchFilters {
  const sort = params.get("sort") as SortKey | null;
  return {
    q: params.get("q")?.trim() ?? "",
    categories: list(params.get("categories")),
    ambiances: list(params.get("ambiances")),
    budgetMax: num(params.get("budget_max")),
    openNow: bool(params.get("open_now")),
    maxDistanceKm: num(params.get("max_distance_km")),
    parking: bool(params.get("parking")),
    wheelchair: bool(params.get("wheelchair")),
    minRating: num(params.get("min_rating")),
    sort: sort && SORT_VALUES.has(sort) ? sort : "relevance",
    city: params.get("city") || null,
    district: params.get("district") || null,
  };
}

/** Filtres → query string de page (stable, valeurs par défaut omises). */
export function filtersToQuery(f: SearchFilters): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.categories.length) p.set("categories", f.categories.join(","));
  if (f.ambiances.length) p.set("ambiances", f.ambiances.join(","));
  if (f.budgetMax) p.set("budget_max", String(f.budgetMax));
  if (f.openNow) p.set("open_now", "true");
  if (f.maxDistanceKm) p.set("max_distance_km", String(f.maxDistanceKm));
  if (f.parking) p.set("parking", "true");
  if (f.wheelchair) p.set("wheelchair", "true");
  if (f.minRating) p.set("min_rating", String(f.minRating));
  if (f.sort !== "relevance") p.set("sort", f.sort);
  if (f.city) p.set("city", f.city);
  if (f.district) p.set("district", f.district);
  return p.toString();
}

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
