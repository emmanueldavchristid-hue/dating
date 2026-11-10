import type { PlaceCard } from "@/lib/types";

export function makePlace(overrides: Partial<PlaceCard> = {}): PlaceCard {
  return {
    id: "p1",
    slug: "le-toit-du-plateau",
    name: "Le Toit du Plateau",
    short_description: "Rooftop avec vue sur la lagune.",
    city: "Abidjan",
    district: "Plateau",
    categories: ["rooftop", "bar"],
    ambiances: ["calme"],
    price_level: 3,
    budget_min_fcfa: 10000,
    budget_max_fcfa: 25000,
    rating_avg: 4.4,
    rating_count: 12,
    cover: { url: null, gradient: ["#1E3A4C", "#0B1117"], alt: "Ambiance du Toit du Plateau" },
    location: { lat: 5.32, lng: -4.02 },
    distance_km: 2.4,
    travel: null,
    open_status: "unknown",
    closes_at: null,
    tier: "free",
    locked: false,
    is_demo: false,
    verified_at: null,
    confidence: 0.6,
    score: 12.3,
    reasons: ["Correspond à vos envies : rooftop"],
    ...overrides,
  };
}
