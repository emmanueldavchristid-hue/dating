import type { ConfigContext, ExpoConfig } from "expo/config";

// Le nom de code se change à un seul endroit : EXPO_PUBLIC_APP_NAME (voir src/lib/config.ts).
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: process.env.EXPO_PUBLIC_APP_NAME?.trim() || config.name || "Sortie",
});
