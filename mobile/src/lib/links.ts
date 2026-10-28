import { Alert, Linking, Platform, Share } from "react-native";
import { APP_NAME, WEB_URL } from "./config";
import type { PlaceCard } from "./types";

/** URL d'itinéraire vers des coordonnées, selon l'appli de cartes visée. */
export function directionsUrl(lat: number, lng: number, app: "google" | "apple", label?: string): string {
  if (app === "apple") {
    const q = label ? `&q=${encodeURIComponent(label)}` : "";
    return `https://maps.apple.com/?daddr=${lat},${lng}${q}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Ouvre l'appli de cartes du téléphone (choix Plans / Google Maps sur iOS). */
export function openDirections(lat: number, lng: number, label: string): void {
  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert("Impossible d'ouvrir les cartes"));
  if (Platform.OS === "ios") {
    Alert.alert("Itinéraire", "Ouvrir avec…", [
      { text: "Plans", onPress: () => open(directionsUrl(lat, lng, "apple", label)) },
      { text: "Google Maps", onPress: () => open(directionsUrl(lat, lng, "google")) },
      { text: "Annuler", style: "cancel" },
    ]);
    return;
  }
  void open(directionsUrl(lat, lng, "google"));
}

export function callPhone(phone: string): void {
  const tel = `tel:${phone.replace(/[^\d+]/g, "")}`;
  Linking.openURL(tel).catch(() => Alert.alert("Appel impossible", phone));
}

export function placeShareMessage(p: Pick<PlaceCard, "name" | "district" | "city" | "short_description" | "slug">): string {
  const where = [p.district, p.city].filter(Boolean).join(", ");
  const link = WEB_URL ? `\n${WEB_URL}/places/${p.slug}` : "";
  return `${p.name} — ${where}\n${p.short_description}\n\nTrouvé sur ${APP_NAME}${link}`;
}

export async function sharePlace(p: Parameters<typeof placeShareMessage>[0]): Promise<boolean> {
  try {
    const res = await Share.share({ message: placeShareMessage(p), title: p.name });
    return res.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}
