import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Jeton : trousseau sécurisé (Keychain / Keystore) sur mobile.
 * Sur le web, aucun stockage sécurisé n'existe → mémoire seulement (perdu au rechargement).
 */
const memory = new Map<string, string>();
const secureAvailable = Platform.OS === "ios" || Platform.OS === "android";

export async function readSecure(key: string): Promise<string | null> {
  if (!secureAvailable) return memory.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function writeSecure(key: string, value: string | null): Promise<void> {
  if (value == null) memory.delete(key);
  else memory.set(key, value);
  if (!secureAvailable) return;
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Mémoire seulement : la session ne survivra pas au redémarrage.
  }
}

/** Données non sensibles (préférences, onboarding, origine) : JSON dans AsyncStorage. */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    if (value == null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible : on continue sans persistance
  }
}
