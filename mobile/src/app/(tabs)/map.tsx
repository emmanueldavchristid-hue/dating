import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions, type ListViewToken as ViewTokenT } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState, Notice, RowSkeleton, useToast } from "@/components/feedback";
import { categoryIcon, Icon } from "@/components/Icon";
import { PlaceRow } from "@/components/PlaceCard";
import { MAP_SUPPORTED, PlacesMap } from "@/components/PlacesMap";
import { TabHeader } from "@/components/Screen";
import { Chip, IconButton, PressableScale, Txt } from "@/components/ui";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api } from "@/lib/api";
import { DEFAULT_CENTER } from "@/lib/config";
import { EMPTY_FILTERS, filtersToApiQuery } from "@/lib/filters";
import { formatDistance, pluralize, travelLabel } from "@/lib/format";
import { tripProgress } from "@/lib/trip";
import type { RouteResult } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, radius, space, themed } from "@/theme/tokens";

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ focus?: string; lat?: string; lng?: string }>();
  const { categories, catName } = useMeta();
  const toast = useToast();
  const { searchOrigin, cityCenter, gps, gpsState, choice, enableGps, originLabel, apiOrigin } = useSettings();
  const [cats, setCats] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  // Zone explorée : par défaut autour de moi (ou de la ville) ; « Rechercher dans cette zone » la remplace.
  const [area, setArea] = useState<{ lat: number; lng: number; km: number } | null>(null);
  const [moved, setMoved] = useState<{ lat: number; lng: number; km: number } | null>(null);
  const listRef = useRef<FlatList>(null);
  const [liveRoute, setLiveRoute] = useState<RouteResult | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [live, setLive] = useState(false);
  const askedGps = useRef(false);

  // La carte part de ma position : on la demande une fois (si elle n'a pas été refusée).
  useEffect(() => {
    if (!MAP_SUPPORTED || askedGps.current || choice.kind === "gps" || gpsState === "denied") return;
    askedGps.current = true;
    void enableGps();
  }, [choice.kind, gpsState, enableGps]);

  // Arrivée depuis une fiche (« Voir sur la carte ») : centrée sur le lieu, qui est sélectionné.
  const focusKey = params.focus ? `${params.focus}:${params.lat}:${params.lng}` : null;
  const [prevFocus, setPrevFocus] = useState<string | null>(null);
  if (focusKey !== prevFocus) {
    setPrevFocus(focusKey);
    if (params.focus && params.lat && params.lng) {
      setArea({ lat: Number(params.lat), lng: Number(params.lng), km: 3 });
      setSelected(params.focus);
      setMoved(null);
      setLiveRoute(null); // nouveau lieu : on repart du trajet calculé pour lui
      setLive(false);
    }
  }

  // Trajet vers le lieu ouvert depuis sa fiche : tracé par la route, durée calculée par le serveur (sans trafic).
  const routeKey = params.focus && gps ? JSON.stringify([gps.lat.toFixed(3), gps.lng.toFixed(3), params.lat, params.lng]) : null;
  const trip = useAsync(
    () => (routeKey && gps ? api.meta.route(gps, { lat: Number(params.lat), lng: Number(params.lng) }).catch(() => null) : Promise.resolve(null)),
    [routeKey],
  );

  // Suivi en direct : position suivie, ligne qui se raccourcit, temps restant, nouveau calcul si on quitte la route.
  const lastReroute = useRef(0);
  const shown = liveRoute ?? trip.data ?? null;
  const progress = live && here && shown ? tripProgress(shown.path, shown.minutes, here) : null;
  const shownRef = useRef(shown);
  const dest = params.lat && params.lng ? { lat: Number(params.lat), lng: Number(params.lng) } : null;
  const destRef = useRef(dest);
  useEffect(() => {
    shownRef.current = shown;
    destRef.current = dest;
  });
  useEffect(() => {
    if (!live) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const onPosition = (pos: Location.LocationObject) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setHere(pt);
      const r = shownRef.current;
      if (!r) return;
      const pr = tripProgress(r.path, r.minutes, pt);
      if (pr.arrived) {
        setLive(false);
        toast("Tu es arrivé, bonne sortie !", "check");
      } else if (pr.offRouteM > 80 && destRef.current && Date.now() - lastReroute.current > 30_000) {
        // sorti de la route : nouveau trajet depuis ici (au plus toutes les 30 s)
        lastReroute.current = Date.now();
        api.meta.route(pt, destRef.current).then(setLiveRoute).catch(() => {});
      }
    };
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 }, onPosition)
      .then((s0) => {
        if (cancelled) s0.remove();
        else sub = s0;
      })
      .catch(() => setLive(false));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [live, toast]);

  const key = JSON.stringify([searchOrigin, cats, area]);
  const res = useAsync(() => {
    if (area) {
      return api.places.search({
        ...filtersToApiQuery({ ...EMPTY_FILTERS, categories: cats, sort: "distance" }, { kind: "gps", lat: area.lat, lng: area.lng }, 1, 50),
        max_distance_km: Math.min(60, Math.max(1, area.km)),
      });
    }
    const near = searchOrigin.kind === "gps";
    return api.places.search(filtersToApiQuery({ ...EMPTY_FILTERS, categories: cats, sort: near ? "distance" : "relevance" }, searchOrigin, 1, 50));
  }, [key]);
  const gems = useAsync(() => api.places.gems(apiOrigin.city ?? undefined), [JSON.stringify(apiOrigin)]);
  const places = (res.data?.items ?? []).filter((p) => p.location && !p.locked);
  const hiddenGems = (gems.data ?? []).filter((g) => g.locked).length;
  const cardW = width - GUTTER * 2 - 24;

  // Sélection dérivée : premier lieu par défaut.
  const selectedId = places.some((p) => p.id === selected) ? selected : (places[0]?.id ?? null);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewTokenT[] }) => {
    const first = viewableItems[0]?.item as { id: string } | undefined;
    if (first) setSelected(first.id);
  }, []);

  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER }}>
      <Chip label="Tout" selected={!cats.length} onPress={() => setCats([])} />
      {categories.map((c) => (
        <Chip
          key={c.slug}
          label={c.name}
          icon={categoryIcon(c.icon || c.slug)}
          selected={cats.includes(c.slug)}
          onPress={() => setCats(cats.includes(c.slug) ? cats.filter((x) => x !== c.slug) : [...cats, c.slug])}
        />
      ))}
    </ScrollView>
  );

  // ---------- Web : pas de carte native → liste explicite
  if (!MAP_SUPPORTED) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: space[7], gap: 12 }}
          ListHeaderComponent={
            <View style={{ gap: space[4], marginBottom: space[2] }}>
              <TabHeader title="Carte" overline={originLabel} />
              <View style={{ paddingHorizontal: GUTTER }}>
                <View style={s.webNotice}>
                  <View style={s.webIcon}>
                    <Icon name="map" size={22} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt variant="title">La carte est disponible dans l&apos;application mobile</Txt>
                    <Txt variant="bodySm" color={colors.textMuted}>
                      Sur le web, voici les mêmes lieux sous forme de liste.
                    </Txt>
                  </View>
                </View>
              </View>
              {chips}
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: GUTTER }}>
              <PlaceRow p={item} catName={catName} />
            </View>
          )}
          ListEmptyComponent={
            res.error ? (
              <ErrorState error={res.error} onRetry={res.reload} />
            ) : res.loading ? (
              <View style={{ paddingHorizontal: GUTTER, gap: 12 }}>
                <RowSkeleton />
                <RowSkeleton />
              </View>
            ) : (
              <Txt variant="body" color={colors.textMuted} style={{ textAlign: "center", padding: space[6] }}>
                Aucun lieu pour ces catégories.
              </Txt>
            )
          }
        />
      </View>
    );
  }

  // ---------- Natif

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PlacesMap
        places={places}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelected(id);
          const i = places.findIndex((p) => p.id === id);
          if (i >= 0) listRef.current?.scrollToIndex({ index: i, animated: true });
        }}
        center={area ? { lat: area.lat, lng: area.lng } : (cityCenter ?? DEFAULT_CENTER)}
        user={area ? null : gps}
        recenterKey={recenter}
        bottomInset={140}
        onRegionChange={setMoved}
        route={shown?.path ?? null}
        routeDoneIndex={progress?.index ?? 0}
        follow={live ? here : null}
      />

      <View style={[s.top, { paddingTop: insets.top + space[2] }]} pointerEvents="box-none">
        <View style={s.topRow} pointerEvents="box-none">
          <View style={s.titlePill}>
            <Icon name="pin" size={15} color={colors.accent} />
            <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {area ? "Zone explorée" : originLabel}
            </Txt>
            {res.data ? (
              <Txt variant="caption" color={colors.textMuted}>
                · {pluralize(places.length, "lieu", "lieux")}
              </Txt>
            ) : null}
          </View>
          <IconButton
            icon="locate"
            label="Revenir autour de moi"
            onPress={() => {
              setArea(null);
              setMoved(null);
              setRecenter((n) => n + 1);
              if (!gps) void enableGps();
            }}
            bg={colors.panel}
          />
        </View>
        {chips}
        {shown ? (
          <View style={s.tripCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="car" size={18} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Txt variant="label">
                  {progress
                    ? `Encore ${progress.remainingMin} min · ${formatDistance(progress.remainingKm)}`
                    : `${travelLabel(shown)} · ${formatDistance(shown.distance_km)}`}
                </Txt>
                <Txt variant="caption" color={colors.textMuted}>
                  Durée calculée sans trafic
                </Txt>
              </View>
              <PressableScale
                onPress={() => {
                  if (live) return setLive(false);
                  setHere(gps);
                  setLive(true);
                }}
                accessibilityRole="button"
                style={[s.tripBtn, live ? { backgroundColor: colors.surface3 } : null]}
              >
                <Txt variant="label" color={live ? colors.text : colors.onAccent}>
                  {live ? "Arrêter" : "Démarrer"}
                </Txt>
              </PressableScale>
            </View>
            {progress ? (
              <View style={s.track} accessibilityLabel={`Trajet fait à ${Math.round(progress.done * 100)} %`}>
                <View style={[s.trackFill, { width: `${Math.round(progress.done * 100)}%` }]} />
              </View>
            ) : null}
          </View>
        ) : null}
        {moved ? (
          <PressableScale
            onPress={() => {
              setArea(moved);
              setMoved(null);
            }}
            accessibilityRole="button"
            style={s.areaBtn}
          >
            <Icon name="search" size={15} color={colors.onAccent} />
            <Txt variant="label" color={colors.onAccent}>
              Rechercher dans cette zone
            </Txt>
          </PressableScale>
        ) : null}
        {hiddenGems ? (
          <PressableScale onPress={() => router.push("/gems")} accessibilityRole="button" accessibilityLabel="Pépites cachées, voir les offres" style={s.gemBanner}>
            <Icon name="lock" size={15} color={colors.gold} />
            <Txt variant="caption" color={colors.gold} style={{ flex: 1 }}>
              {hiddenGems} pépite{hiddenGems > 1 ? "s" : ""} cachée{hiddenGems > 1 ? "s" : ""} : position réservée aux membres Insider
            </Txt>
            <Icon name="chevronRight" size={15} color={colors.gold} />
          </PressableScale>
        ) : null}
      </View>

      <View style={[s.carousel, { bottom: space[4] }]} pointerEvents="box-none">
        {res.error ? (
          <View style={s.floatCard}>
            <Notice icon="wifiOff">Impossible de charger les lieux. Tire pour réessayer depuis Découvrir.</Notice>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            horizontal
            data={places}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardW + 12}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            getItemLayout={(_, index) => ({ length: cardW + 12, offset: (cardW + 12) * index, index })}
            renderItem={({ item }) => (
              <View style={{ width: cardW }}>
                <PlaceRow p={item} catName={catName} />
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0, gap: space[3] },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: GUTTER },
  titlePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  tripBtn: { height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  tripCard: {
    marginHorizontal: GUTTER,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  areaBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  gemBanner: {
    marginHorizontal: GUTTER,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  carousel: { position: "absolute", left: 0, right: 0 },
  floatCard: { marginHorizontal: GUTTER },
  webNotice: { flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderStrong },
  webIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
}));
