import { describe, expect, it } from "vitest";
import {
  confidenceLabel,
  directionsUrl,
  distanceLabel,
  formatBudgetRange,
  formatFcfa,
  formatRating,
  haversineKm,
  openStatusLabel,
  planLabel,
  travelLabel,
} from "@/lib/format";

// Les espaces insécables sont normalisés pour la lisibilité des assertions.
const n = (s: string | null) => (s == null ? s : s.replace(/ /g, " "));

describe("FCFA", () => {
  it("formate 15000 en « 15 000 FCFA »", () => {
    expect(n(formatFcfa(15000))).toBe("15 000 FCFA");
    expect(formatFcfa(15000)).toBe("15 000 FCFA");
  });
  it("gère petits et grands montants", () => {
    expect(n(formatFcfa(500))).toBe("500 FCFA");
    expect(n(formatFcfa(1250000))).toBe("1 250 000 FCFA");
    expect(n(formatFcfa(0))).toBe("0 FCFA");
  });
  it("fourchettes de budget", () => {
    expect(n(formatBudgetRange(5000, 15000))).toBe("5 000 – 15 000 FCFA");
    expect(n(formatBudgetRange(5000, 5000))).toBe("5 000 FCFA");
    expect(n(formatBudgetRange(5000, null))).toBe("Dès 5 000 FCFA");
    expect(n(formatBudgetRange(null, 8000))).toBe("Jusqu'à 8 000 FCFA");
    expect(formatBudgetRange(null, null)).toBeNull();
    expect(n(formatBudgetRange(0, 5000))).toBe("Gratuit – 5 000 FCFA");
    expect(formatBudgetRange(0, 0)).toBe("Gratuit");
  });
});

describe("distances (à vol d'oiseau)", () => {
  it("étiquette toujours « à vol d'oiseau »", () => {
    expect(n(distanceLabel(2.4))).toBe("2,4 km à vol d'oiseau");
    expect(n(distanceLabel(0.65))).toBe("650 m à vol d'oiseau");
    expect(n(distanceLabel(23.7))).toBe("24 km à vol d'oiseau");
  });
  it("renvoie null si inconnue", () => {
    expect(distanceLabel(null)).toBeNull();
    expect(distanceLabel(undefined)).toBeNull();
    expect(distanceLabel(Number.NaN)).toBeNull();
  });
  it("haversine cohérent", () => {
    expect(haversineKm({ lat: 5.3237, lng: -4.0186 }, { lat: 5.348, lng: -3.987 })).toBeCloseTo(4.4, 0);
    expect(haversineKm(null, { lat: 0, lng: 0 })).toBeNull();
  });
});

describe("trajet", () => {
  it("n'invente rien sans fournisseur", () => {
    expect(travelLabel(null)).toBeNull();
  });
  it("formate un trajet fourni", () => {
    expect(n(travelLabel({ mode: "driving", minutes: 12.4, source: "OSRM" }))).toBe("12 min en voiture");
    expect(n(travelLabel({ mode: "walking", minutes: 75, source: "OSRM" }))).toBe("1 h15 à pied");
  });
});

describe("statut d'ouverture", () => {
  it("unknown → « Horaires non vérifiés »", () => {
    expect(openStatusLabel("unknown")).toBe("Horaires non vérifiés");
  });
  it("open / closed", () => {
    expect(openStatusLabel("open", "23:00")).toBe("Ouvert · ferme à 23:00");
    expect(openStatusLabel("open", null)).toBe("Ouvert");
    expect(openStatusLabel("closed")).toBe("Fermé");
  });
});

describe("divers", () => {
  it("note absente", () => {
    expect(formatRating(null, 0)).toBe("Pas encore d'avis");
    expect(n(formatRating(4.25, 8))).toBe("4,3 (8 avis)");
  });
  it("fiabilité", () => {
    expect(confidenceLabel(0.9).label).toBe("Élevée");
    expect(confidenceLabel(0.6).label).toBe("Moyenne");
    expect(confidenceLabel(0.2).label).toBe("Faible");
  });
  it("offres", () => {
    expect(planLabel("free")).toBe("Découverte");
    expect(planLabel("insider")).toBe("Insider");
  });
  it("lien d'itinéraire externe", () => {
    expect(directionsUrl(5.3, -4.01)).toContain("openstreetmap.org/directions?to=5.3%2C-4.01");
    expect(directionsUrl(5.3, -4.01, "google")).toBe("https://www.google.com/maps/dir/?api=1&destination=5.3,-4.01");
  });
});
