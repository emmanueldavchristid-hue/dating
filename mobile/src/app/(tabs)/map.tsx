import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions, type ListViewToken as ViewTokenT } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState, Notice, RowSkeleton } from "@/components/feedback";
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
import { pluralize } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, radius, space } from "@/theme/tokens";

export default function MapTab() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { categories, catName } = useMeta();
  const { searchOrigin, cityCenter, gps, originLabel, apiOrigin } = useSettings();
  const [cats, setCats] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const listRef = useRef<FlatList>(null);
  const key = JSON.stringify([searchOrigin, cats]);

  const res = useAsync(
    () => api.places.search(filtersToApiQuery({ ...EMPTY_FILTERS, categories: cats }, searchOrigin, 1, 50)),
    [key],
  );
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
        center={cityCenter ?? DEFAULT_CENTER}
        user={gps}
        recenterKey={recenter}
        bottomInset={140}
      />

      <View style={[s.top, { paddingTop: insets.top + space[2] }]} pointerEvents="box-none">
        <View style={s.topRow} pointerEvents="box-none">
          <View style={s.titlePill}>
            <Icon name="pin" size={15} color={colors.accent} />
            <Txt variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
              {originLabel}
            </Txt>
            {res.data ? (
              <Txt variant="caption" color={colors.textMuted}>
                · {pluralize(places.length, "lieu", "lieux")}
              </Txt>
            ) : null}
          </View>
          <IconButton icon="locate" label="Recentrer la carte" onPress={() => setRecenter((n) => n + 1)} bg="rgba(21,23,29,0.95)" />
        </View>
        {chips}
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

const s = StyleSheet.create({
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
    backgroundColor: "rgba(21,23,29,0.95)",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  gemBanner: {
    marginHorizontal: GUTTER,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    backgroundColor: "rgba(43,36,22,0.95)",
    borderWidth: 1,
    borderColor: colors.goldBorder,
  },
  carousel: { position: "absolute", left: 0, right: 0 },
  floatCard: { marginHorizontal: GUTTER },
  webNotice: { flexDirection: "row", gap: 14, alignItems: "center", padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderStrong },
  webIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
});
