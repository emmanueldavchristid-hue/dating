import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Ambiance, BillingPlan, Capabilities, Category, CategoryGroup, City } from "@/lib/types";

interface MetaValue {
  /** Catégories qui ont au moins un lieu (les vides ne sont jamais proposées). */
  categories: Category[];
  /** Envies (Manger, Boire un verre, Danser…) avec leurs catégories non vides. */
  groups: CategoryGroup[];
  /** Ambiances qui ont au moins un lieu. */
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
  const [allCategories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [allAmbiances, setAmbiances] = useState<Ambiance[]>([]);
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
    api.meta.groups().then(setGroups).catch(() => {});
    api.meta.capabilities().then(setCapabilities).catch(() => {});
    api.billing.plans().then(setPlans).catch(() => {});
  }, []);

  useEffect(reload, [reload]);

  const categories = useMemo(() => allCategories.filter((c) => c.count === undefined || c.count > 0), [allCategories]);
  const ambiances = useMemo(() => allAmbiances.filter((a) => a.count === undefined || a.count > 0), [allAmbiances]);
  const value = useMemo<MetaValue>(
    () => ({
      categories,
      groups,
      ambiances,
      cities,
      capabilities,
      plans,
      catName: Object.fromEntries(allCategories.map((c) => [c.slug, c.name])),
      ambName: Object.fromEntries(allAmbiances.map((a) => [a.slug, a.name])),
      loaded,
      error,
      reload,
    }),
    [categories, groups, ambiances, allCategories, allAmbiances, cities, capabilities, plans, loaded, error, reload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMeta(): MetaValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMeta hors MetaProvider");
  return v;
}
