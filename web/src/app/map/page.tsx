"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CategoryIcon, IconAlert, IconArrowRight, IconGem, IconList, IconLocate, IconMap, IconSliders, IconX } from "@/components/icons";
import { useOriginLabel } from "@/components/location/LocationChip";
import { Cover } from "@/components/place/Cover";
import { DemoBadge, DistanceTravel, OpenBadge, RatingInline } from "@/components/place/PlaceMeta";
import { PlaceCard } from "@/components/place/PlaceCard";
import { FilterSheet } from "@/components/search/FilterSheet";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { api } from "@/lib/api";
import { DEFAULT_CENTER } from "@/lib/config";
import { countActiveFilters, filtersToApiQuery, filtersToQuery, toggleIn } from "@/lib/filters";
import { formatBudgetRange } from "@/lib/format";
import type { PlaceCard as Place } from "@/lib/types";
import { useUrlFilters } from "@/lib/useUrlFilters";
import styles from "./map.module.css";

const MapView = dynamic(() => import("@/components/map/MapView"), {
  ssr: false,
  loading: () => <div className={`skeleton ${styles.mapSkeleton}`} aria-label="Chargement de la carte" />,
});

function MapScreen() {
  const { filters, apply } = useUrlFilters();
  const { categories, capabilities, cities, categoryName } = useMeta();
  const { origin, coords, city, gpsStatus, acceptGps, consent } = useLocation();
  const { user } = useAuth();
  const originLabel = useOriginLabel();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [listOpen, setListOpen] = useState(false);

  const queryKey = JSON.stringify(filtersToApiQuery(filters, origin, 1, 50));
  useEffect(() => {
    if (gpsStatus === "locating") return;
    const ctrl = new AbortController();
    setError(null);
    setPlaces(null);
    api.places
      .search(JSON.parse(queryKey), ctrl.signal)
      .then((res) => {
        setPlaces(res.items);
        setTotal(res.total);
      })
      .catch((e) => !ctrl.signal.aborted && setError(e));
    return () => ctrl.abort();
  }, [queryKey, gpsStatus, attempt, user?.id]);

  const center = useMemo(() => {
    if (coords) return coords;
    const c = cities.find((x) => x.slug === (filters.city ?? city));
    return c?.center ?? DEFAULT_CENTER;
  }, [coords, cities, city, filters.city]);

  const mappable = places?.filter((p) => p.location) ?? [];
  const hidden = (places?.length ?? 0) - mappable.length;
  const sel = places?.find((p) => p.id === selected) ?? null;
  const degraded = capabilities?.map === "none" || tilesFailed;
  const active = countActiveFilters(filters);
  const searchHref = `/search${filtersToQuery(filters) ? `?${filtersToQuery(filters)}` : ""}`;

  return (
    <div className={styles.screen}>
      <title>Carte</title>
      <div className={styles.topBar}>
        <div className={styles.topRow}>
          <h1 className={styles.title}>Carte</h1>
          <span className={styles.origin}>{originLabel}</span>
          <div className={styles.topActions}>
            <button type="button" className={`btn btn-sm ${active ? styles.filterActive : ""}`} onClick={() => setSheet(true)} aria-haspopup="dialog">
              <IconSliders /> Filtres{active ? ` · ${active}` : ""}
            </button>
            <Link href={searchHref} className="btn btn-sm btn-ghost">
              <IconList /> Liste
            </Link>
          </div>
        </div>
        <div className="chip-row" aria-label="Catégories">
          {categories.map((c) => (
            <button
              key={c.slug}
              type="button"
              className="chip"
              aria-pressed={filters.categories.includes(c.slug)}
              onClick={() => apply({ ...filters, categories: toggleIn(filters.categories, c.slug) })}
            >
              <CategoryIcon slug={c.slug} icon={c.icon} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {degraded ? (
        <div className={styles.degraded}>
          <div className={styles.degradedNote} role="status">
            <IconAlert />
            <div>
              <strong>Carte indisponible pour le moment.</strong>
              <p>
                {capabilities?.map === "none"
                  ? "L'affichage cartographique n'est pas activé sur ce service."
                  : "Les fonds de carte OpenStreetMap ne se chargent pas (connexion ?)."}{" "}
                Voici les lieux sous forme de liste, triés depuis {originLabel.toLowerCase() === "autour de moi" ? "votre position" : originLabel}.
              </p>
            </div>
          </div>
          {error ? (
            <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : !places ? (
            <div className="skeleton" style={{ height: 240, borderRadius: 20 }} />
          ) : places.length === 0 ? (
            <EmptyState title="Aucun lieu dans cette zone" />
          ) : (
            <div className="grid-cards">
              {places.map((p) => (
                <PlaceCard key={p.id} place={p} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.body}>
          <aside className={`${styles.side} ${listOpen ? styles.sideOpen : ""}`} aria-label="Lieux sur la carte">
            <div className={styles.sideHead}>
              <strong>{places ? `${mappable.length} lieu${mappable.length > 1 ? "x" : ""} sur la carte` : "Chargement…"}</strong>
              {total > (places?.length ?? 0) ? <span className="subtle">50 premiers sur {total}</span> : null}
              <button type="button" className={`icon-btn icon-btn-sm ${styles.sideClose}`} onClick={() => setListOpen(false)} aria-label="Fermer la liste">
                <IconX />
              </button>
            </div>
            {hidden > 0 ? (
              <p className={styles.hiddenNote}>
                <IconGem size={14} /> {hidden} pépite{hidden > 1 ? "s" : ""} masquée{hidden > 1 ? "s" : ""} (position réservée aux membres).{" "}
                <Link href="/premium" className="link">
                  Débloquer
                </Link>
              </p>
            ) : null}
            <ul className={styles.list}>
              {mappable.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.listItem}
                    aria-pressed={p.id === selected}
                    onClick={() => {
                      setSelected(p.id);
                      setListOpen(false);
                    }}
                  >
                    <Cover cover={p.cover} category={p.categories[0]} size="thumb" className={styles.thumb} />
                    <span className={styles.listText}>
                      <span className={styles.listName}>{p.name}</span>
                      <span className="subtle">
                        {p.categories.slice(0, 1).map(categoryName).join("")}
                        {p.district ? ` · ${p.district}` : ""}
                      </span>
                    </span>
                    {p.tier === "premium" ? <IconGem size={16} style={{ color: "var(--gold)" }} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className={styles.mapWrap}>
            <MapView
              places={mappable}
              selectedId={selected}
              onSelect={setSelected}
              center={center}
              user={coords}
              recenterKey={recenter}
              onTilesFailed={() => setTilesFailed(true)}
            />
            <div className={styles.mapControls}>
              <button type="button" className={`icon-btn ${styles.listToggle}`} onClick={() => setListOpen(true)} aria-label="Afficher la liste des lieux">
                <IconList />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  if (consent !== "granted") acceptGps();
                  setRecenter((n) => n + 1);
                }}
                aria-label={coords ? "Recentrer sur ma position" : "Recentrer sur le point de départ"}
                title={coords ? "Recentrer sur ma position" : "Recentrer (partagez votre position pour être localisé)"}
              >
                <IconLocate />
              </button>
            </div>
            {error ? (
              <div className={styles.overlay}>
                <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} compact />
              </div>
            ) : places && mappable.length === 0 ? (
              <div className={styles.toast} role="status">
                <IconMap size={16} /> Aucun lieu à afficher avec ces filtres.
              </div>
            ) : null}
            {sel ? (
              <div className={styles.selCard} role="region" aria-label={`Lieu sélectionné : ${sel.name}`}>
                <Link href={`/places/${encodeURIComponent(sel.slug)}`} className={styles.selLink}>
                  <Cover cover={sel.cover} category={sel.categories[0]} size="thumb" className={styles.selThumb} />
                  <span className={styles.selBody}>
                    <span className="row wrap" style={{ gap: 6 }}>
                      <OpenBadge status={sel.open_status} closesAt={sel.closes_at} />
                      {sel.is_demo ? <DemoBadge /> : null}
                    </span>
                    <strong className={styles.selName}>{sel.name}</strong>
                    <span className={styles.selMeta}>
                      <RatingInline avg={sel.rating_avg} count={sel.rating_count} />
                      {formatBudgetRange(sel.budget_min_fcfa, sel.budget_max_fcfa) ? (
                        <span>{formatBudgetRange(sel.budget_min_fcfa, sel.budget_max_fcfa)}</span>
                      ) : null}
                    </span>
                    <span className="subtle">
                      <DistanceTravel km={sel.distance_km} travel={sel.travel} />
                    </span>
                  </span>
                  <IconArrowRight className={styles.selArrow} />
                </Link>
                <button type="button" className={`icon-btn icon-btn-sm ${styles.selClose}`} onClick={() => setSelected(null)} aria-label="Fermer l'aperçu">
                  <IconX />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <FilterSheet open={sheet} onClose={() => setSheet(false)} value={filters} onApply={apply} hideSort />
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="page" aria-busy="true" />}>
      <MapScreen />
    </Suspense>
  );
}
