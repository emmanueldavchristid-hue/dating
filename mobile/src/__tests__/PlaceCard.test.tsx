import { render, screen } from "@testing-library/react-native";
import { PlaceRow, PlaceTile } from "@/components/PlaceCard";
import type { PlaceCard } from "@/lib/types";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const base: PlaceCard = {
  id: "p1",
  slug: "rooftop-horizon-8",
  name: "Rooftop Horizon 8",
  short_description: "Vue à 360°",
  city: "Abidjan",
  district: "Plateau",
  categories: ["rooftop"],
  ambiances: ["calme"],
  price_level: 3,
  budget_min_fcfa: 15000,
  budget_max_fcfa: 40000,
  rating_avg: 4.8,
  rating_count: 8,
  cover: { url: null, gradient: ["#1E3A4C", "#0B1117"], alt: "Ambiance" },
  location: { lat: 5.32, lng: -4.01 },
  distance_km: 1.9,
  travel: null,
  open_status: "open",
  closes_at: "01:00",
  tier: "free",
  locked: false,
  is_demo: true,
  verified_at: null,
  confidence: 0.3,
  score: 60,
  reasons: ["Ouvert maintenant"],
  match: null,
};
const names = { rooftop: "Rooftops" };
const text = (s: string) => new RegExp(s.replace(/ /g, "[\\s\\u00a0]"));

describe("PlaceCard — règles d'honnêteté", () => {
  it("badge Démo visible si is_demo", async () => {
    await render(<PlaceTile p={base} catName={names} />);
    expect(screen.getByText("Démo")).toBeTruthy();
    await render(<PlaceRow p={{ ...base, is_demo: false, id: "p2" }} catName={names} />);
    expect(screen.queryByText("Démo")).toBeNull();
  });

  it("distance étiquetée « à vol d'oiseau » et aucun temps de trajet si travel=null", async () => {
    await render(<PlaceRow p={base} catName={names} />);
    expect(screen.getByTestId("distance")).toHaveTextContent(text("1,9 km à vol d'oiseau"));
    expect(screen.queryByTestId("travel")).toBeNull();
    expect(screen.queryByText(/min en voiture|à pied/)).toBeNull();
  });

  it("temps de trajet affiché avec sa source quand fourni", async () => {
    await render(<PlaceRow p={{ ...base, travel: { mode: "driving", minutes: 12, source: "osrm" } }} catName={names} />);
    expect(screen.getByTestId("travel")).toHaveTextContent(text("12 min en voiture \\(osrm\\)"));
  });

  it("pastille d'affinité seulement si match non nul", async () => {
    const { rerender } = await render(<PlaceTile p={base} catName={names} />);
    expect(screen.queryByText(/pour toi/)).toBeNull();
    await rerender(<PlaceTile p={{ ...base, match: undefined }} catName={names} />);
    expect(screen.queryByText(/pour toi/)).toBeNull();
    await rerender(<PlaceTile p={{ ...base, match: 92 }} catName={names} />);
    expect(screen.getByText(text("92 % pour toi"))).toBeTruthy();
  });

  it("sans avis → « Pas encore d'avis » ; horaires inconnus → « Horaires non vérifiés »", async () => {
    await render(<PlaceRow p={{ ...base, rating_avg: null, rating_count: 0, open_status: "unknown", closes_at: null }} catName={names} />);
    expect(screen.getByTestId("rating")).toHaveTextContent("Pas encore d'avis");
    expect(screen.getByText("Horaires non vérifiés")).toBeTruthy();
  });

  it("pépite verrouillée : ni nom ni position, style Insider", async () => {
    const locked = { ...base, name: "Le Salon Sans Enseigne", locked: true, tier: "premium" as const, location: null, distance_km: null };
    await render(<PlaceTile p={locked} catName={names} />);
    expect(screen.getByTestId("locked-card")).toBeTruthy();
    expect(screen.queryByText(/Salon Sans Enseigne/)).toBeNull();
    expect(screen.getByText("Pépite Insider")).toBeTruthy();
    await render(<PlaceRow p={locked} catName={names} />);
    expect(screen.queryByText(/Salon Sans Enseigne/)).toBeNull();
    expect(screen.queryByTestId("distance")).toBeNull();
  });
});
