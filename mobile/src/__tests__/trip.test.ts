import { tripProgress } from "@/lib/trip";

// Tracé droit d'environ 2,2 km vers le nord, 10 points.
const path = Array.from({ length: 10 }, (_, i) => ({ lat: 5.3 + i * 0.002, lng: -4.0 }));

describe("tripProgress (suivi en direct)", () => {
  it("au départ : tout reste à faire", () => {
    const p = tripProgress(path, 10, { lat: 5.3, lng: -4.0 });
    expect(p.index).toBe(0);
    expect(p.done).toBeCloseTo(0, 1);
    expect(p.remainingMin).toBe(10);
    expect(p.arrived).toBe(false);
  });
  it("à mi-chemin : la moitié du temps reste", () => {
    const p = tripProgress(path, 10, { lat: 5.309, lng: -4.0 });
    expect(p.remainingMin).toBeGreaterThanOrEqual(4);
    expect(p.remainingMin).toBeLessThanOrEqual(6);
    expect(p.offRouteM).toBeLessThan(150);
  });
  it("détecte la sortie de route et l'arrivée", () => {
    expect(tripProgress(path, 10, { lat: 5.306, lng: -3.995 }).offRouteM).toBeGreaterThan(400);
    const end = tripProgress(path, 10, { lat: 5.318, lng: -4.0 });
    expect(end.arrived).toBe(true);
    expect(end.remainingMin).toBe(0);
  });
});
