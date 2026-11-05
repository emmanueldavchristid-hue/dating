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

/** Lien WhatsApp (numéro au format international, +225 ajouté aux numéros ivoiriens à 10 chiffres). */
export function whatsappUrl(phone: string, text = ""): string | null {
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.length === 10) digits = `225${digits}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** « Y aller » : d'abord la carte de l'app ; le guidage vocal passe par Google Maps, Waze ou Plans. */
export function goThere(lat: number, lng: number, label: string, showInApp: () => void): void {
  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert("Impossible d'ouvrir l'application"));
  if (Platform.OS === "web") return void open(directionsUrl(lat, lng, "google")); // pas de feuille d'options sur le web
  const options: { text: string; onPress?: () => void; style?: "cancel" }[] = [
    { text: "Voir le trajet dans l'app", onPress: showInApp },
    { text: "Guidage avec Google Maps", onPress: () => open(directionsUrl(lat, lng, "google")) },
    { text: "Guidage avec Waze", onPress: () => open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
  ];
  if (Platform.OS === "ios") options.push({ text: "Guidage avec Plans", onPress: () => open(directionsUrl(lat, lng, "apple", label)) });
  options.push({ text: "Annuler", style: "cancel" });
  Alert.alert(label, "Comment veux-tu y aller ?", options);
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
