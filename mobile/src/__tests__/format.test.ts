import {
  distanceLabel,
  formatBudgetRange,
  formatFcfa,
  formatRating,
  initials,
  isNaturalQuery,
  matchLabel,
  openStatusLabel,
  travelLabel,
} from "@/lib/format";
import { validateRegister } from "@/lib/validation";

const sp = (s: string) => s.replace(/ /g, " ");

describe("formatage", () => {
  it("FCFA avec espaces insécables", () => {
    expect(formatFcfa(15000)).toBe("15 000 FCFA");
    expect(sp(formatFcfa(1500000))).toBe("1 500 000 FCFA");
  });
  it("fourchettes de budget", () => {
    expect(sp(formatBudgetRange(0, 5000)!)).toBe("Gratuit – 5 000 FCFA");
    expect(sp(formatBudgetRange(15000, 40000)!)).toBe("15 000 – 40 000 FCFA");
    expect(formatBudgetRange(0, 0)).toBe("Gratuit");
    expect(sp(formatBudgetRange(8000, null)!)).toBe("Dès 8 000 FCFA");
    expect(formatBudgetRange(null, null)).toBeNull();
  });
  it("distance toujours à vol d'oiseau", () => {
    expect(sp(distanceLabel(1.94)!)).toBe("1,9 km à vol d'oiseau");
    expect(sp(distanceLabel(0.34)!)).toBe("340 m à vol d'oiseau");
    expect(sp(distanceLabel(16.2)!)).toBe("16 km à vol d'oiseau");
    expect(distanceLabel(null)).toBeNull();
  });
  it("trajet uniquement si fourni", () => {
    expect(travelLabel(null)).toBeNull();
    expect(sp(travelLabel({ mode: "driving", minutes: 12.4, source: "osrm" })!)).toBe("12 min en voiture");
    expect(sp(travelLabel({ mode: "walking", minutes: 75, source: "osrm" })!)).toBe("1 h15 à pied");
  });
  it("statut d'ouverture et note", () => {
    expect(openStatusLabel("unknown")).toBe("Horaires non vérifiés");
    expect(openStatusLabel("open", "01:00")).toBe("Ouvert · ferme à 01:00");
    expect(formatRating(null, 0)).toBe("Pas encore d'avis");
    expect(sp(formatRating(4.8, 8))).toBe("4,8 (8 avis)");
  });
  it("affinité : null → rien, faible → rien, forte → pastille", () => {
    expect(matchLabel(null)).toBeNull();
    expect(matchLabel(undefined)).toBeNull();
    expect(matchLabel(9)).toBeNull();
    expect(sp(matchLabel(92)!)).toBe("92 % pour toi");
    expect(sp(matchLabel(140)!)).toBe("100 % pour toi");
  });
  it("phrase naturelle → concierge", () => {
    expect(isNaturalQuery("rooftop")).toBe(false);
    expect(isNaturalQuery("un rooftop calme ce soir")).toBe(true);
    expect(isNaturalQuery("garba ?")).toBe(true);
  });
  it("initiales", () => {
    expect(initials("Koffi (Découverte)")).toBe("K");
    expect(initials("Aya Kouassi")).toBe("AK");
    expect(initials("")).toBe("?");
  });
  it("validation d'inscription", () => {
    expect(validateRegister("A", "x", "123")).toEqual({ name: expect.any(String), email: expect.any(String), password: expect.any(String) });
    expect(validateRegister("Aya", "aya@ex.ci", "motdepasse")).toEqual({ name: null, email: null, password: null });
  });
});
