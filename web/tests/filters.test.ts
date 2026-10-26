import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, countActiveFilters, filtersFromQuery, filtersToApiQuery, filtersToQuery, toggleIn, type SearchFilters } from "@/lib/filters";
import { routeForQuery, safeNext } from "@/lib/routes";

const full: SearchFilters = {
  q: "garba",
  categories: ["maquis", "restaurant"],
  ambiances: ["festif"],
  budgetMax: 10000,
  openNow: true,
  maxDistanceKm: 5,
  parking: true,
  wheelchair: true,
  minRating: 4,
  sort: "distance",
  city: "abidjan",
  district: "cocody",
};

describe("filtres ⇄ URL", () => {
  it("aller-retour sans perte", () => {
    const qs = filtersToQuery(full);
    expect(filtersFromQuery(new URLSearchParams(qs))).toEqual(full);
  });
  it("omet les valeurs par défaut", () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toBe("");
    expect(filtersToQuery({ ...EMPTY_FILTERS, sort: "relevance", q: "  " })).toBe("");
  });
  it("sérialise de façon lisible", () => {
    expect(filtersToQuery({ ...EMPTY_FILTERS, categories: ["bar", "lounge"], openNow: true })).toBe("categories=bar%2Clounge&open_now=true");
  });
  it("tolère les valeurs invalides", () => {
    const f = filtersFromQuery(new URLSearchParams("sort=n_importe&budget_max=abc&min_rating=-2&categories=,bar,,bar&open_now=1"));
    expect(f.sort).toBe("relevance");
    expect(f.budgetMax).toBeNull();
    expect(f.minRating).toBeNull();
    expect(f.categories).toEqual(["bar"]);
    expect(f.openNow).toBe(true);
  });
});

describe("filtres → API", () => {
  it("utilise le GPS si pas de ville forcée", () => {
    const q = filtersToApiQuery({ ...full, city: null, district: null }, { kind: "gps", lat: 5.3, lng: -4 }, 2, 20);
    expect(q).toMatchObject({ lat: 5.3, lng: -4, page: 2, page_size: 20, budget_max: 10000, open_now: true, sort: "distance" });
    expect(q.city).toBeUndefined();
  });
  it("une ville choisie dans les filtres l'emporte sur la position", () => {
    const q = filtersToApiQuery(full, { kind: "gps", lat: 5.3, lng: -4 });
    expect(q.city).toBe("abidjan");
    expect(q.district).toBe("cocody");
    expect(q.lat).toBeUndefined();
  });
  it("sans GPS : ville et quartier de départ", () => {
    const q = filtersToApiQuery(EMPTY_FILTERS, { kind: "city", city: "grand-bassam", district: "quartier-france" });
    expect(q).toMatchObject({ city: "grand-bassam", district: "quartier-france", sort: "relevance" });
  });
});

describe("utilitaires", () => {
  it("compte les filtres actifs (hors texte et tri)", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters(full)).toBe(11); // 2 catégories + 1 ambiance + 8 critères
  });
  it("toggleIn", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
  it("routeForQuery : phrase → concierge, mots-clés → recherche", () => {
    expect(routeForQuery("rooftop")).toBe("/search?q=rooftop");
    expect(routeForQuery("un endroit calme pour dîner")).toMatch(/^\/concierge\?q=/);
    expect(routeForQuery("garba ?")).toMatch(/^\/concierge/);
    expect(routeForQuery("   ")).toBe("/search");
  });
  it("safeNext bloque les redirections externes", () => {
    expect(safeNext("/me")).toBe("/me");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
