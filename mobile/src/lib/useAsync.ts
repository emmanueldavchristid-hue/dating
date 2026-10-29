import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chargement simple avec rechargement et « pull-to-refresh ».
 * `deps` : valeurs primitives (ou sérialisables) qui déclenchent un nouveau chargement.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  const key = JSON.stringify(deps);

  useEffect(() => {
    fnRef.current = fn;
  });

  const load = useCallback(async (mode: "load" | "refresh" = "load") => {
    const id = ++seq.current;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fnRef.current();
      if (id === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e);
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    // Chargement de données au montage / changement de clé : setState asynchrone voulu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabled) void load();
  }, [load, enabled, key]);

  return {
    data,
    setData,
    error,
    loading: enabled && loading,
    refreshing,
    reload: () => {
      setError(null);
      return load();
    },
    refresh: () => load("refresh"),
  };
}
