/**
 * Configuration centrale. Le nom de l'application est un nom de code :
 * il se change à un seul endroit via NEXT_PUBLIC_APP_NAME.
 */
export const APP_NAME: string = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Sortie";

export const API_URL: string = (
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export const APP_TAGLINE = "Votre concierge de sorties à Abidjan";

/** Ville par défaut quand la position n'est pas partagée. */
export const DEFAULT_CITY = "abidjan";
export const DEFAULT_CENTER = { lat: 5.3364, lng: -4.0267 };

export const STORAGE_KEYS = {
  token: "sortie.token",
  prefs: "sortie.prefs",
  consent: "sortie.location",
  onboarded: "sortie.onboarded",
} as const;
