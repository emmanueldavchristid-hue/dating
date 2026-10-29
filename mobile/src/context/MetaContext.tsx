import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Ambiance, BillingPlan, Capabilities, Category, City } from "@/lib/types";

interface MetaValue {
  categories: Category[];
  ambiances: Ambiance[];
  cities: City[];
  capabilities: Capabilities | null;
  plans: BillingPlan[];
  catName: Record<string, string>;
  ambName: Record<string, string>;
  loaded: boolean;
  error: unknown;
  reload: () => void;
}

const Ctx = createContext<MetaValue | null>(null);

export function MetaProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [ambiances, setAmbiances] = useState<Ambiance[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    Promise.all([api.meta.categories(), api.meta.ambiances(), api.meta.cities()])
      .then(([c, a, ci]) => {
        setError(null);
        setCategories(c);
        setAmbiances(a);
        setCities(ci);
        setLoaded(true);
      })
      .catch((e: unknown) => setError(e));
    api.meta.capabilities().then(setCapabilities).catch(() => {});
    api.billing.plans().then(setPlans).catch(() => {});
  }, []);

  useEffect(reload, [reload]);

  const value = useMemo<MetaValue>(
    () => ({
      categories,
      ambiances,
      cities,
      capabilities,
      plans,
      catName: Object.fromEntries(categories.map((c) => [c.slug, c.name])),
      ambName: Object.fromEntries(ambiances.map((a) => [a.slug, a.name])),
      loaded,
      error,
      reload,
    }),
    [categories, ambiances, cities, capabilities, plans, loaded, error, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMeta(): MetaValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMeta hors MetaProvider");
  return v;
}
