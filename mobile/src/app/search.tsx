import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/feedback";
import { FilterSheet } from "@/components/FilterSheet";
import { Icon } from "@/components/Icon";
import { PlaceRow } from "@/components/PlaceCard";
import { goBack } from "@/components/Screen";
import { SearchBar } from "@/components/SearchBar";
import { Chip, IconButton, PressableScale, Txt } from "@/components/ui";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api } from "@/lib/api";
import { activeFilterChips, countActiveFilters, EMPTY_FILTERS, filtersToApiQuery, SORTS, type SearchFilters } from "@/lib/filters";
import { isNaturalQuery, pluralize } from "@/lib/format";
import type { PlaceCard } from "@/lib/types";
import { colors, GUTTER, space } from "@/theme/tokens";

const PAGE_SIZE = 20;

function initialFilters(params: Record<string, string | string[] | undefined>): SearchFilters {
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const list = (k: string) => str(k).split(",").filter(Boolean);
  const sort = SORTS.find((x) => x.value === str("sort"))?.value ?? "relevance";
  return { ...EMPTY_FILTERS, q: str("q"), categories: list("categories"), ambiances: list("ambiances"), openNow: str("open_now") === "true", sort };
}

export default function Search() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { catName, ambName } = useMeta();
  const { searchOrigin, originLabel, setCity } = useSettings();
  const [filters, setFilters] = useState<SearchFilters>(() => initialFilters(params));
  const [text, setText] = useState(filters.q);
  // Nouveaux paramètres d'URL (ex. catégorie choisie ailleurs) → on repart de ces filtres.
  const paramsKey = JSON.stringify(params);
  const [prevParams, setPrevParams] = useState(paramsKey);
  if (paramsKey !== prevParams) {
    setPrevParams(paramsKey);
    const next = initialFilters(params);
    setFilters(next);
    setText(next.q);
  }
  const [items, setItems] = useState<PlaceCard[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sheet, setSheet] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const originKey = JSON.stringify(searchOrigin);

  const fetchPage = useCallback(
    async (p: number, mode: "reset" | "more" | "refresh") => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      if (mode === "reset") setLoading(true);
      if (mode === "more") setMore(true);
      if (mode === "refresh") setRefreshing(true);
      setError(null);
      try {
        const res = await api.places.search(filtersToApiQuery(filters, searchOrigin, p, PAGE_SIZE), c.signal);
        setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items.filter((x) => !prev.some((y) => y.id === x.id))]));
        setTotal(res.total);
        setPage(p);
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") setError(e);
      } finally {
        if (ctrl.current === c) {
          setLoading(false);
          setMore(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, originKey],
  );

  useEffect(() => {
    // Recherche relancée quand les filtres ou l'origine changent (chargement asynchrone).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(1, "reset");
  }, [fetchPage]);

  const chips = useMemo(() => activeFilterChips(filters, { categories: catName, ambiances: ambName }), [filters, catName, ambName]);
  const nActive = countActiveFilters(filters);
  const hasMore = total != null && items.length < total;

  const submit = () => {
    const t = text.trim();
    if (isNaturalQuery(t)) {
      router.push({ pathname: "/concierge", params: { q: t } });
      return;
    }
    setFilters((f) => ({ ...f, q: t }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + space[2] }]}>
        <View style={s.bar}>
          <IconButton icon="chevronLeft" label="Retour" onPress={() => goBack()} size={42} />
          <View style={{ flex: 1 }}>
            <SearchBar
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              onClear={() => {
                setText("");
                setFilters((f) => ({ ...f, q: "" }));
              }}
              placeholder="Rechercher un lieu"
              autoFocus={!filters.q && !filters.categories.length && !filters.openNow && filters.sort === "relevance"}
            />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: GUTTER }} style={{ marginTop: space[3], marginRight: -GUTTER }}>
          <PressableScale onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={`Filtres${nActive ? `, ${nActive} actifs` : ""}`} style={[s.filterBtn, nActive ? s.filterOn : null]}>
            <Icon name="sliders" size={16} color={nActive ? colors.onAccent : colors.text} />
            <Txt variant="label" color={nActive ? colors.onAccent : colors.text}>
              Filtres{nActive ? ` · ${nActive}` : ""}
            </Txt>
          </PressableScale>
          {filters.sort !== "relevance" ? (
            <Chip size="sm" selected label={SORTS.find((x) => x.value === filters.sort)?.label ?? ""} trailing="x" onPress={() => setFilters({ ...filters, sort: "relevance" })} accessibilityLabel="Retirer le tri" />
          ) : null}
          {chips.map((c) => (
            <Chip key={c.key} size="sm" selected label={c.label} trailing="x" onPress={() => setFilters(c.remove(filters))} accessibilityLabel={`Retirer le filtre ${c.label}`} />
          ))}
        </ScrollView>
      </View>

      {error && !items.length ? (
        <ErrorState error={error} onRetry={() => fetchPage(1, "reset")} />
      ) : loading && !items.length ? (
        <View style={{ padding: GUTTER, gap: 14 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <RowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: 12 }}
          ListHeaderComponent={
            total != null ? (
              <Txt variant="label" color={colors.textMuted} style={{ marginBottom: 4 }}>
                {pluralize(total, "lieu", "lieux")} · {originLabel}
              </Txt>
            ) : undefined
          }
          renderItem={({ item, index }) => (
            <Animated.View entering={index < 8 ? FadeInDown.delay(index * 40).duration(320) : undefined}>
              <PlaceRow p={item} catName={catName} showReasons />
            </Animated.View>
          )}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !more && !loading) void fetchPage(page + 1, "more");
          }}
          ListFooterComponent={more ? <ActivityIndicator color={colors.accent} style={{ marginVertical: space[4] }} /> : undefined}
          ListEmptyComponent={
            searchOrigin.kind === "city" && searchOrigin.district ? (
              <EmptyState
                icon="search"
                title="Rien dans ce quartier"
                body={`Aucun lieu ne correspond à ces critères à ${originLabel.split(",")[0]}. Élargis à toute la ville ou retire un filtre.`}
                action={{ label: "Toute la ville", icon: "pin", onPress: () => setCity(searchOrigin.city, null) }}
              />
            ) : (
              <EmptyState
                icon="search"
                title="Aucun lieu ne correspond"
                body="Essaie d'élargir la distance, le budget ou de retirer un filtre."
                action={
                  nActive || filters.q
                    ? {
                        label: "Réinitialiser",
                        icon: "refresh",
                        onPress: () => {
                          setText("");
                          setFilters(EMPTY_FILTERS);
                        },
                      }
                    : undefined
                }
              />
            )
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPage(1, "refresh")} tintColor={colors.accent} colors={[colors.accent]} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      <FilterSheet visible={sheet} onClose={() => setSheet(false)} value={filters} onApply={setFilters} gpsActive={searchOrigin.kind === "gps"} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: GUTTER, paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginBottom: space[3] },
  bar: { flexDirection: "row", alignItems: "center", gap: 10 },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  filterOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
