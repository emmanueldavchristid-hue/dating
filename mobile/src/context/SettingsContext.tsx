import * as Location from "expo-location";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Origin } from "@/lib/api";
import { DEFAULT_CITY, STORAGE_KEYS } from "@/lib/config";
import type { SearchOrigin } from "@/lib/filters";
import { readJson, writeJson } from "@/lib/storage";
import type { Preferences } from "@/lib/types";
import { useAuth } from "./AuthContext";
import { useMeta } from "./MetaContext";

/** Choix de l'utilisateur : position GPS (après consentement explicite) ou ville/quartier. */
export type OriginChoice = { kind: "gps" } | { kind: "city"; city: string; district: string | null };

export const EMPTY_PREFS: Preferences = { categories: [], ambiances: [], budget_max_fcfa: null, home_city: DEFAULT_CITY };

type GpsState = "idle" | "locating" | "ok" | "denied" | "error";

interface SettingsValue {
  ready: boolean;
  onboarded: boolean;
  completeOnboarding: () => Promise<void>;
  prefs: Preferences;
  savePrefs: (p: Preferences) => Promise<void>;
  choice: OriginChoice;
  gps: { lat: number; lng: number } | null;
  gpsState: GpsState;
  /** Demande la permission système (uniquement après l'écran de consentement in-app). */
  enableGps: () => Promise<boolean>;
  setCity: (city: string, district: string | null) => Promise<void>;
  /** Paramètres d'origine pour l'API (lat/lng si GPS disponible, sinon ville). */
  apiOrigin: Origin;
  searchOrigin: SearchOrigin;
  originLabel: string;
  cityCenter: { lat: number; lng: number } | null;
}

const Ctx = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const { cities } = useMeta();
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(EMPTY_PREFS);
  const [choice, setChoice] = useState<OriginChoice>({ kind: "city", city: DEFAULT_CITY, district: null });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const syncedFor = useRef<string | null>(null);

  const locate = useCallback(async (): Promise<boolean> => {
    setGpsState("locating");
    try {
      const pos =
        (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setGpsState("ok");
      return true;
    } catch {
      setGpsState("error");
      return false;
    }
  }, []);

  // Démarrage : relit l'état local ; ne redemande jamais la permission sans action de l'utilisateur.
  useEffect(() => {
    (async () => {
      const [ob, p, o] = await Promise.all([
        readJson<boolean>(STORAGE_KEYS.onboarded),
        readJson<Preferences>(STORAGE_KEYS.prefs),
        readJson<OriginChoice>(STORAGE_KEYS.origin),
      ]);
      setOnboarded(!!ob);
      if (p) setPrefs({ ...EMPTY_PREFS, ...p });
      if (o) setChoice(o);
      setReady(true);
      if (o?.kind === "gps") {
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.granted) await locate();
          else setGpsState("denied");
        } catch {
          setGpsState("error");
        }
      }
    })();
  }, [locate]);

  // À la connexion : préférences du compte prioritaires ; sinon on pousse celles de l'onboarding.
  useEffect(() => {
    if (!user || syncedFor.current === user.id) return;
    syncedFor.current = user.id;
    const remote = user.preferences;
    const remoteEmpty = !remote.categories.length && !remote.ambiances.length && remote.budget_max_fcfa == null;
    if (remoteEmpty && (prefs.categories.length || prefs.ambiances.length || prefs.budget_max_fcfa)) {
      api.me.updatePreferences(prefs).then(setUser).catch(() => {});
    } else {
      const merged = { ...EMPTY_PREFS, ...remote, home_city: remote.home_city ?? prefs.home_city };
      // Synchronisation ponctuelle avec le compte (source externe), une seule fois par utilisateur.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefs(merged);
      void writeJson(STORAGE_KEYS.prefs, merged);
    }
    const wantsGps = choice.kind === "gps";
    if (user.location_consent !== wantsGps) api.me.consent(wantsGps).then(setUser).catch(() => {});
  }, [user, prefs, choice.kind, setUser]);

  const completeOnboarding = useCallback(async () => {
    setOnboarded(true);
    await writeJson(STORAGE_KEYS.onboarded, true);
  }, []);

  const savePrefs = useCallback(
    async (p: Preferences) => {
      setPrefs(p);
      await writeJson(STORAGE_KEYS.prefs, p);
      if (user) {
        const u = await api.me.updatePreferences(p);
        setUser(u);
      }
    },
    [user, setUser],
  );

  const enableGps = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setGpsState("denied");
        return false;
      }
    } catch {
      setGpsState("error");
      return false;
    }
    const next: OriginChoice = { kind: "gps" };
    setChoice(next);
    await writeJson(STORAGE_KEYS.origin, next);
    if (user) api.me.consent(true).then(setUser).catch(() => {});
    return locate();
  }, [locate, user, setUser]);

  const setCity = useCallback(
    async (city: string, district: string | null) => {
      const next: OriginChoice = { kind: "city", city, district };
      setChoice(next);
      setGps(null);
      setGpsState("idle");
      await writeJson(STORAGE_KEYS.origin, next);
      if (user?.location_consent) api.me.consent(false).then(setUser).catch(() => {});
    },
    [user, setUser],
  );

  const value = useMemo<SettingsValue>(() => {
    const cityFallback = prefs.home_city || DEFAULT_CITY;
    const useGps = choice.kind === "gps" && gps != null;
    const citySlug = choice.kind === "city" ? choice.city : cityFallback;
    const district = choice.kind === "city" ? choice.district : null;
    const city = cities.find((c) => c.slug === citySlug);
    const districtName = district ? city?.districts.find((d) => d.slug === district)?.name ?? null : null;
    const originLabel = useGps
      ? "Autour de moi"
      : choice.kind === "gps"
        ? gpsState === "locating"
          ? "Localisation…"
          : `${city?.name ?? "Abidjan"} (position indisponible)`
        : [districtName, city?.name ?? "Abidjan"].filter(Boolean).join(", ");
    return {
      ready,
      onboarded,
      completeOnboarding,
      prefs,
      savePrefs,
      choice,
      gps,
      gpsState,
      enableGps,
      setCity,
      apiOrigin: useGps ? { lat: gps.lat, lng: gps.lng } : { city: citySlug },
      searchOrigin: useGps ? { kind: "gps", lat: gps.lat, lng: gps.lng } : { kind: "city", city: citySlug, district },
      originLabel,
      cityCenter: useGps ? gps : city?.center ?? null,
    };
  }, [ready, onboarded, completeOnboarding, prefs, savePrefs, choice, gps, gpsState, enableGps, setCity, cities]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings hors SettingsProvider");
  return v;
}
