"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Ambiance, Capabilities, Category, City } from "@/lib/types";

interface MetaState {
  categories: Category[];
  ambiances: Ambiance[];
  cities: City[];
  capabilities: Capabilities | null;
  status: "loading" | "ready" | "error";
  retry: () => void;
  categoryName: (slug: string) => string;
  ambianceName: (slug: string) => string;
  cityName: (slug: string | null | undefined) => string;
  categoryIcon: (slug: string) => string | null;
  districtName: (city: string | null | undefined, district: string | null | undefined) => string;
}

const MetaContext = createContext<MetaState | null>(null);

function humanize(slug: string): string {
  const s = slug.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function MetaProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [ambiances, setAmbiances] = useState<Ambiance[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [status, setStatus] = useState<MetaState["status"]>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.meta.categories(), api.meta.ambiances(), api.meta.cities(), api.meta.capabilities()]).then(
      ([c, a, ci, cap]) => {
        if (cancelled) return;
        if (c.status === "fulfilled") setCategories(c.value);
        if (a.status === "fulfilled") setAmbiances(a.value);
        if (ci.status === "fulfilled") setCities(ci.value);
        if (cap.status === "fulfilled") setCapabilities(cap.value);
        setStatus(c.status === "fulfilled" ? "ready" : "error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<MetaState>(() => {
    const cat = new Map(categories.map((c) => [c.slug, c]));
    const amb = new Map(ambiances.map((a) => [a.slug, a.name]));
    const cit = new Map(cities.map((c) => [c.slug, c.name]));
    return {
      categories,
      ambiances,
      cities,
      capabilities,
      status,
      retry,
      categoryName: (s) => cat.get(s)?.name ?? humanize(s),
      categoryIcon: (s) => cat.get(s)?.icon ?? null,
      ambianceName: (s) => amb.get(s) ?? humanize(s),
      cityName: (s) => (s ? cit.get(s) ?? s : ""),
      districtName: (c, d) => {
        if (!d) return "";
        const city = cities.find((x) => x.slug === c);
        const found = city?.districts.find((x) => x.slug === d) ?? cities.flatMap((x) => x.districts).find((x) => x.slug === d);
        return found?.name ?? humanize(d);
      },
    };
  }, [categories, ambiances, cities, capabilities, status, retry]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaState {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta doit être utilisé dans <MetaProvider>");
  return ctx;
}

/** Variante tolérante (composants testés hors fournisseur). */
export function useMetaOptional(): MetaState | null {
  return useContext(MetaContext);
}

export function humanizeSlug(slug: string): string {
  return humanize(slug);
}
