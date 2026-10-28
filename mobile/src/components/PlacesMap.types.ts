import type { PlaceCard } from "@/lib/types";

export interface PlacesMapProps {
  places: PlaceCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  center: { lat: number; lng: number };
  user: { lat: number; lng: number } | null;
  /** Incrémenter pour recentrer la carte. */
  recenterKey: number;
  bottomInset: number;
}
