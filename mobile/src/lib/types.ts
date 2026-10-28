// Types miroirs du contrat docs/API.md (v1.1). Ne pas diverger.

export type Tier = "free" | "premium";
export type OpenStatus = "open" | "closed" | "unknown";
export type Plan = "free" | "plus" | "insider";
export type Role = "user" | "curator" | "admin";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Cover {
  url: string | null;
  gradient: [string, string];
  alt: string;
}

export interface Travel {
  mode: "driving" | "walking";
  minutes: number;
  source: string;
}

export interface PlaceCard {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  city: string;
  district: string | null;
  categories: string[];
  ambiances: string[];
  price_level: number | null;
  budget_min_fcfa: number | null;
  budget_max_fcfa: number | null;
  rating_avg: number | null;
  rating_count: number;
  cover: Cover;
  location: LatLng | null;
  distance_km: number | null;
  travel: Travel | null;
  open_status: OpenStatus;
  closes_at: string | null;
  tier: Tier;
  locked: boolean;
  is_demo: boolean;
  verified_at: string | null;
  confidence: number;
  score: number | null;
  reasons: string[];
  /** v1.1 — 0..100 ; absent (ancien backend) ou null → ne rien afficher. */
  match?: number | null;
}

export interface Amenities {
  parking: boolean | null;
  wheelchair: boolean | null;
  wifi: boolean | null;
  card_payment: boolean | null;
  mobile_money: boolean | null;
  outdoor: boolean | null;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  created_at: string;
}

export interface PlaceDetail extends PlaceCard {
  description: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours: { weekday: number; open: string; close: string }[];
  amenities: Amenities;
  photos: { url: string | null; gradient: [string, string]; alt: string; credit: string | null }[];
  reviews_summary: string | null;
  reviews: Review[];
  source: { kind: "demo" | "osm" | "partner" | "curated"; attribution: string | null };
  events: { id: string; title: string; starts_at: string; price_fcfa: number | null }[];
  is_favorite: boolean;
}

export interface Preferences {
  categories: string[];
  ambiances: string[];
  budget_max_fcfa: number | null;
  home_city: string | null;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  plan: Plan;
  preferences: Preferences;
  location_consent: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

// Méta
export interface Category {
  slug: string;
  name: string;
  icon: string;
}
export interface Ambiance {
  slug: string;
  name: string;
}
export interface District {
  slug: string;
  name: string;
}
/** Forme brute : le contrat annonce string[], le backend renvoie {slug,name}[] — on accepte les deux. */
export interface CityRaw {
  slug: string;
  name: string;
  center: LatLng;
  districts: (string | District)[];
}
export interface City {
  slug: string;
  name: string;
  center: LatLng;
  districts: District[];
}
export interface Capabilities {
  map: "osm" | "none";
  routing: "none" | "osrm";
  ai: "rules" | "anthropic";
  payments: "none" | string;
  demo_data: boolean;
}

// Recherche
export type SortKey = "relevance" | "distance" | "popularity" | "newest";

export interface SearchResponse {
  items: PlaceCard[];
  total: number;
  page: number;
  page_size: number;
  origin: { lat: number; lng: number; source: "gps" | "city" };
}

export interface HomeSection {
  key: string;
  title: string;
  subtitle: string;
  items: PlaceCard[];
}
export interface HomeResponse {
  sections: HomeSection[];
}

export type ReportKind = "closed" | "wrong_hours" | "wrong_location" | "wrong_price" | "other";

// Collections
export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  count: number;
}
export interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  items: PlaceCard[];
}

// Itinéraires
export interface SuggestRequest {
  lat?: number;
  lng?: number;
  city?: string;
  categories?: string[];
  ambiances?: string[];
  budget_max_fcfa?: number;
  steps: number;
}
export interface SuggestResponse {
  steps: { place: PlaceCard; leg_km: number | null }[];
  total_budget_min_fcfa: number | null;
  total_budget_max_fcfa: number | null;
  notes: string[];
}
export interface ItineraryStepInput {
  place_id: string;
  start_time?: string;
  note?: string;
}
export interface ItineraryStep {
  position: number;
  place: PlaceCard;
  start_time: string | null;
  note: string | null;
  leg_km: number | null;
}
export interface Itinerary {
  id: string;
  title: string;
  date: string | null;
  steps: ItineraryStep[];
}
/** Élément de `GET /me/itineraries` — forme non précisée par le contrat : champs tolérants. */
export interface ItinerarySummary {
  id: string;
  title: string;
  date: string | null;
  steps?: ItineraryStep[];
  step_count?: number;
  steps_count?: number;
  count?: number;
}

// Concierge
export interface ConciergeResponse {
  reply: string;
  places: PlaceCard[];
  parsed: {
    categories: string[];
    ambiances: string[];
    budget_max_fcfa: number | null;
    open_now: boolean | null;
    q: string | null;
    district?: string | null;
  };
  provider: "rules" | "anthropic";
  /** v1.1 */
  retrieval?: "hybrid" | "lexical";
  quota: { used: number; limit: number };
}

// Abonnements
export interface BillingPlan {
  code: Plan;
  name: string;
  price_fcfa: number | null;
  features: string[];
  quotas: { concierge_per_day: number; itinerary_max_steps: number };
}
export interface Subscription {
  plan: Plan;
  status: string;
  current_period_end: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// Matching & signaux (v1.1)
export type EventType = "view" | "favorite" | "share" | "directions" | "call" | "itinerary_add" | "dismiss";
export interface Taste {
  top_categories: { slug: string; weight: number }[];
  top_ambiances: { slug: string; weight: number }[];
  budget_typical_fcfa: number | null;
  signals: number;
}
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
