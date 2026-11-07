import type { ConfigContext, ExpoConfig } from "expo/config";

// Le nom de code se change à un seul endroit : EXPO_PUBLIC_APP_NAME (voir src/lib/config.ts).
// Carte Android dans une version publiée (EAS Build) : clé Google Maps SDK for Android dans GOOGLE_MAPS_ANDROID_KEY.
// Expo Go n'en a pas besoin ; sans elle, une version publiée afficherait une carte grise.
export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY?.trim();
  const base = config as ExpoConfig;
  return {
    ...base,
    name: process.env.EXPO_PUBLIC_APP_NAME?.trim() || config.name || "Sortie",
    android: mapsKey ? { ...base.android, config: { ...base.android?.config, googleMaps: { apiKey: mapsKey } } } : base.android,
  };
};
