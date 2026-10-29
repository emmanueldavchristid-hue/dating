"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { DEFAULT_CITY, STORAGE_KEYS } from "@/lib/config";
import type { SearchOrigin } from "@/lib/filters";
import { readJSON, writeJSON } from "@/lib/storage";
import { useAuth } from "./AuthContext";

export type Consent = "unknown" | "granted" | "denied";
export type GpsStatus = "idle" | "locating" | "ok" | "denied" | "unavailable";

interface Stored {
  consent: Consent;
  city: string;
  district: string | null;
}

interface LocationState {
  consent: Consent;
  gpsStatus: GpsStatus;
  coords: { lat: number; lng: number } | null;
  city: string;
  district: string | null;
  /** Origine à transmettre à l'API : GPS si disponible, sinon ville. */
  origin: SearchOrigin;
  /** Paramètres simples (lat/lng ou city) pour les endpoints qui les acceptent. */
  originParams: { lat?: number; lng?: number; city?: string };
  /** À appeler UNIQUEMENT après acceptation explicite de l'utilisateur. */
  acceptGps: () => void;
  declineGps: () => void;
  setCity: (city: string, district?: string | null) => void;
}

const LocationContext = createContext<LocationState | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [consent, setConsent] = useState<Consent>("unknown");
  const [city, setCityState] = useState(DEFAULT_CITY);
  const [district, setDistrict] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("idle");
  const hydrated = useRef(false);

  const persist = useCallback((next: Partial<Stored>) => {
    const cur = readJSON<Stored>(STORAGE_KEYS.consent) ?? { consent: "unknown", city: DEFAULT_CITY, district: null };
    writeJSON(STORAGE_KEYS.consent, { ...cur, ...next });
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("unavailable");
      return;
    }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("ok");
      },
      (err) => {
        setCoords(null);
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  // Restauration du choix stocké ; on ne relance la géolocalisation que si l'utilisateur l'a déjà acceptée.
  useEffect(() => {
    const stored = readJSON<Stored>(STORAGE_KEYS.consent);
    if (stored) {
      setConsent(stored.consent);
      if (stored.city) setCityState(stored.city);
      setDistrict(stored.district ?? null);
      if (stored.consent === "granted") locate();
    }
    hydrated.current = true;
  }, [locate]);

  // Compte connecté : le consentement serveur fait foi s'il a été refusé côté compte.
  useEffect(() => {
    if (!user || !hydrated.current) return;
    if (!user.location_consent && consent === "granted") {
      setConsent("denied");
      setCoords(null);
      setGpsStatus("idle");
      persist({ consent: "denied" });
    }
    if (user.preferences.home_city && !readJSON<Stored>(STORAGE_KEYS.consent)?.city) {
      setCityState(user.preferences.home_city);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const acceptGps = useCallback(() => {
    setConsent("granted");
    persist({ consent: "granted" });
    if (user) api.me.consent(true).catch(() => undefined);
    locate();
  }, [locate, persist, user]);

  const declineGps = useCallback(() => {
    setConsent("denied");
    setCoords(null);
    setGpsStatus("idle");
    persist({ consent: "denied" });
    if (user) api.me.consent(false).catch(() => undefined);
  }, [persist, user]);

  const setCity = useCallback(
    (c: string, d: string | null = null) => {
      setCityState(c);
      setDistrict(d);
      persist({ city: c, district: d });
    },
    [persist],
  );

  const value = useMemo<LocationState>(() => {
    const useGps = consent === "granted" && coords != null;
    const origin: SearchOrigin = useGps
      ? { kind: "gps", lat: coords.lat, lng: coords.lng }
      : { kind: "city", city, district };
    return {
      consent,
      gpsStatus,
      coords: useGps ? coords : null,
      city,
      district,
      origin,
      originParams: useGps ? { lat: coords.lat, lng: coords.lng } : { city },
      acceptGps,
      declineGps,
      setCity,
    };
  }, [consent, gpsStatus, coords, city, district, acceptGps, declineGps, setCity]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation doit être utilisé dans <LocationProvider>");
  return ctx;
}
