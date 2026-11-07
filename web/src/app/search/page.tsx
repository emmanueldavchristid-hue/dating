"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { CategoryIcon, IconMap, IconSearch, IconSliders, IconX } from "@/components/icons";
import { LocationChip } from "@/components/location/LocationChip";
import { PlaceCard, PlaceCardSkeleton } from "@/components/place/PlaceCard";
import { FilterSheet } from "@/components/search/FilterSheet";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { api } from "@/lib/api";
import { EMPTY_FILTERS, SORTS, countActiveFilters, filtersToApiQuery, filtersToQuery, toggleIn, type SearchFilters } from "@/lib/filters";
import { formatFcfa, groupThousands } from "@/lib/format";
import type { PlaceCard as Place, SortKey } from "@/lib/types";
import { useUrlFilters } from "@/lib/useUrlFilters";
import styles from "./search.module.css";

const PAGE_SIZE = 20;

function SearchView() {
  const { filters, apply } = useUrlFilters();
  const { categories, categoryName, ambianceName, cityName, districtName } = useMeta();
  const { origin, gpsStatus } = useLocation();
  const { user } = useAuth();
  const [items, setItems] = useState<Place[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "more">("loading");
  const [error, setError] = useState<unknown>(null);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState(filters.q);
  const [attempt, setAttempt] = useState(0);
  const reqId = useRef(0);

  useEffect(() => setQ(filters.q), [filters.q]);

  const queryKey = JSON.stringify(filtersToApiQuery(filters, origin, 1, PAGE_SIZE));

  useEffect(() => {
    if (gpsStatus === "locating") return;
    const id = ++reqId.current;
    const ctrl = new AbortController();
    setStatus("loading");
    setError(null);
    api.places
      .search(JSON.parse(queryKey), ctrl.signal)
      .then((res) => {
        if (id !== reqId.current) return;
        setItems(res.items);
        setTotal(res.total);
        setPage(res.page);
        setStatus("ready");
      })
      .catch((e) => {
        if (ctrl.signal.aborted || id !== reqId.current) return;
        setError(e);
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [queryKey, gpsStatus, attempt, user?.id]);

  const loadMore = async () => {
    const id = reqId.current;
    setStatus("more");
    try {
      const res = await api.places.search(filtersToApiQuery(filters, origin, page + 1, PAGE_SIZE));
      if (id !== reqId.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.items.filter((p) => !seen.has(p.id))];
      });
      setTotal(res.total);
      setPage(res.page);
      setStatus("ready");
    } catch (e) {
      setError(e);
      setStatus("ready");
    }
  };

  const active = countActiveFilters(filters);
  const update = (patch: Partial<SearchFilters>) => apply({ ...filters, ...patch });

  // Puces des filtres actifs, retirables individuellement
  const pills: { key: string; label: string; remove: () => void }[] = [
    ...filters.categories.map((c) => ({ key: `c-${c}`, label: categoryName(c), remove: () => update({ categories: filters.categories.filter((x) => x !== c) }) })),
    ...filters.ambiances.map((a) => ({ key: `a-${a}`, label: ambianceName(a), remove: () => update({ ambiances: filters.ambiances.filter((x) => x !== a) }) })),
    ...(filters.budgetMax ? [{ key: "b", label: `≤ ${formatFcfa(filters.budgetMax)}`, remove: () => update({ budgetMax: null }) }] : []),
    ...(filters.openNow ? [{ key: "o", label: "Ouvert maintenant", remove: () => update({ openNow: false }) }] : []),
    ...(filters.maxDistanceKm ? [{ key: "d", label: `≤ ${filters.maxDistanceKm} km`, remove: () => update({ maxDistanceKm: null }) }] : []),
    ...(filters.parking ? [{ key: "p", label: "Parking", remove: () => update({ parking: false }) }] : []),
    ...(filters.wheelchair ? [{ key: "w", label: "Accessible PMR", remove: () => update({ wheelchair: false }) }] : []),
    ...(filters.minRating ? [{ key: "r", label: `Note ≥ ${String(filters.minRating).replace(".", ",")}`, remove: () => update({ minRating: null }) }] : []),
    ...(filters.city ? [{ key: "city", label: cityName(filters.city), remove: () => update({ city: null, district: null }) }] : []),
    ...(filters.district ? [{ key: "dist", label: districtName(filters.city, filters.district), remove: () => update({ district: null }) }] : []),
  ];

  const mapHref = `/map${filtersToQuery(filters) ? `?${filtersToQuery(filters)}` : ""}`;

  return (
    <div className="page">
      <title>Rechercher</title>
      <div className="page-head">
        <p className="eyebrow">Découverte</p>
        <h1 className="page-title">Trouver où sortir</h1>
      </div>

      <div className={styles.toolbar}>
        <form
          role="search"
          className={styles.searchForm}
          onSubmit={(e) => {
            e.preventDefault();
            update({ q });
          }}
        >
          <IconSearch className={styles.searchIcon} />
          <label htmlFor="search-q" className="sr-only">
            Rechercher
          </label>
          <input
            id="search-q"
            className={`input ${styles.searchInput}`}
            placeholder="Nom, plat, quartier, ambiance…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
          />
          {q ? (
            <button
              type="button"
              className={styles.clear}
              aria-label="Effacer la recherche"
              onClick={() => {
                setQ("");
                update({ q: "" });
              }}
            >
              <IconX size={16} />
            </button>
          ) : null}
        </form>
        <div className={styles.tools}>
          <button type="button" className={`btn ${active ? styles.filterActive : ""}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
            <IconSliders />
            Filtres
            {active ? <span className={styles.count} aria-label={`${active} filtres actifs`}>{active}</span> : null}
          </button>
          <label className={styles.sortLabel}>
            <span className="sr-only">Trier par</span>
            <select className={`select ${styles.sort}`} value={filters.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <Link href={mapHref} className="btn btn-ghost" aria-label="Voir les résultats sur la carte">
            <IconMap />
            <span className={styles.hideSm}>Carte</span>
          </Link>
        </div>
      </div>

      <div className={`chip-row ${styles.quick}`} aria-label="Catégories">
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            className="chip"
            aria-pressed={filters.categories.includes(c.slug)}
            onClick={() => update({ categories: toggleIn(filters.categories, c.slug) })}
          >
            <CategoryIcon slug={c.slug} icon={c.icon} />
            {c.name}
          </button>
        ))}
      </div>

      <div className={styles.summary}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className={styles.total} aria-live="polite">
            {status === "loading" ? "Recherche…" : `${groupThousands(total)} lieu${total > 1 ? "x" : ""}`}
          </span>
          {!filters.city ? <LocationChip /> : null}
        </div>
        {pills.length ? (
          <div className={styles.pills}>
            {pills.map((p) => (
              <button key={p.key} type="button" className={`chip is-active ${styles.pill}`} onClick={p.remove} aria-label={`Retirer le filtre ${p.label}`}>
                {p.label}
                <IconX />
              </button>
            ))}
            <button type="button" className="link" onClick={() => apply({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort })}>
              Tout effacer
            </button>
          </div>
        ) : null}
      </div>

      {status === "error" ? (
        <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : status === "loading" ? (
        <div className="grid-cards" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <PlaceCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconSearch />}
          title="Aucun lieu ne correspond"
          action={
            active || filters.q ? (
              <button type="button" className="btn btn-primary" onClick={() => apply({ ...EMPTY_FILTERS })}>
                Réinitialiser la recherche
              </button>
            ) : undefined
          }
        >
          <p>Élargissez la zone, augmentez le budget ou retirez quelques filtres.</p>
        </EmptyState>
      ) : (
        <>
          <div className="grid-cards">
            {items.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
          <div className={styles.more}>
            {items.length < total ? (
              <button type="button" className="btn btn-lg" onClick={loadMore} disabled={status === "more"}>
                {status === "more" ? <span className="spinner" aria-hidden="true" /> : null}
                {status === "more" ? "Chargement…" : "Charger plus"}
              </button>
            ) : (
              <p className="subtle">Vous avez tout vu · {groupThousands(total)} résultat{total > 1 ? "s" : ""}</p>
            )}
            {error && status === "ready" ? <p className="form-error">Impossible de charger la suite. Réessayez.</p> : null}
          </div>
        </>
      )}

      <FilterSheet open={sheet} onClose={() => setSheet(false)} value={filters} onApply={apply} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="page" aria-busy="true" />}>
      <SearchView />
    </Suspense>
  );
}
