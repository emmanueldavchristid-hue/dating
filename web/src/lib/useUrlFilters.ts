"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { filtersFromQuery, filtersToQuery, type SearchFilters } from "./filters";

/** Filtres de recherche synchronisés avec l'URL (partageables, bouton retour). */
export function useUrlFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.toString();
  const filters = useMemo(() => filtersFromQuery(new URLSearchParams(key)), [key]);
  const apply = useCallback(
    (f: SearchFilters) => {
      const qs = filtersToQuery(f);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );
  return { filters, apply, queryString: key };
}
