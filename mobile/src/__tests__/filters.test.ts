import { activeFilterChips, countActiveFilters, EMPTY_FILTERS, filtersToApiQuery } from "@/lib/filters";
import { buildQuery } from "@/lib/api";
import { moveItem, relegs, totalBudget } from "@/lib/itinerary";
import type { PlaceCard } from "@/lib/types";

describe("filtres → API", () => {
  const f = { ...EMPTY_FILTERS, q: " rooftop ", categories: ["rooftop", "bar"], openNow: true, budgetMax: 20000, minRating: 4, sort: "distance" as const };

  it("origine GPS → lat/lng", () => {
    const q = filtersToApiQuery(f, { kind: "gps", lat: 5.3, lng: -4 }, 2, 20);
    expect(q).toMatchObject({ q: "rooftop", lat: 5.3, lng: -4, page: 2, page_size: 20, open_now: true, budget_max: 20000, min_rating: 4, sort: "distance" });
    expect(q.city).toBeUndefined();
  });

  it("origine ville + quartier → city/district, sérialisation stable", () => {
    const q = filtersToApiQuery(f, { kind: "city", city: "abidjan", district: "cocody" });
    expect(q.city).toBe("abidjan");
    expect(q.district).toBe("cocody");
    expect(buildQuery(q)).toBe(
      "?q=rooftop&categories=rooftop%2Cbar&budget_max=20000&open_now=true&min_rating=4&sort=distance&page=1&page_size=20&city=abidjan&district=cocody",
    );
  });

  it("valeurs par défaut omises", () => {
    expect(buildQuery(filtersToApiQuery(EMPTY_FILTERS, { kind: "city", city: "abidjan", district: null }))).toBe(
      "?sort=relevance&page=1&page_size=20&city=abidjan",
    );
  });

  it("compte et retire les filtres actifs", () => {
    expect(countActiveFilters(f)).toBe(5);
    const chips = activeFilterChips(f, { categories: { rooftop: "Rooftops", bar: "Bars" }, ambiances: {} });
    expect(chips.map((c) => c.label.replace(/ /g, " "))).toEqual(["Rooftops", "Bars", "≤ 20 000 FCFA", "Ouvert maintenant", "Note ≥ 4"]);
    const after = chips[0]!.remove(f);
    expect(after.categories).toEqual(["bar"]);
  });
});

describe("itinéraire", () => {
  const P = (id: string, lat: number, lng: number, min: number | null, max: number | null) =>
    ({ id, location: { lat, lng }, budget_min_fcfa: min, budget_max_fcfa: max }) as unknown as PlaceCard;
  const steps = [
    { place: P("a", 5.32, -4.02, 5000, 10000), leg_km: null },
    { place: P("b", 5.33, -4.02, 2000, 4000), leg_km: 1.1 },
  ];
  it("recalcule les distances à vol d'oiseau après réordonnancement", () => {
    const r = relegs(moveItem(steps, 1, 0));
    expect(r[0]!.place.id).toBe("b");
    expect(r[0]!.leg_km).toBeNull();
    expect(r[1]!.leg_km).toBeCloseTo(1.1, 1);
  });
  it("budget cumulé ou null si inconnu", () => {
    expect(totalBudget(steps)!.replace(/ /g, " ")).toBe("7 000 – 14 000 FCFA");
    expect(totalBudget([...steps, { place: P("c", 5, -4, null, 1000), leg_km: null }])).toBeNull();
  });
});
