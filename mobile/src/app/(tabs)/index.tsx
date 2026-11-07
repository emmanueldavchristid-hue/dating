import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState, Notice, TileSkeleton } from "@/components/feedback";
import { categoryIcon, Icon } from "@/components/Icon";
import { LocationPicker } from "@/components/LocationPicker";
import { PlaceTile } from "@/components/PlaceCard";
import { SearchBar } from "@/components/SearchBar";
import { Sheet } from "@/components/Sheet";
import { EventTile } from "@/components/EventCard";
import { PressableScale, SectionTitle, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import { colors, fonts, GUTTER, radius, space, themed } from "@/theme/tokens";

/** « Tout voir » : ouvre une recherche équivalente à la section. */
const SECTION_SEARCH: Record<string, Record<string, string>> = {
  open_now: { open_now: "true" },
  outdoor: { categories: "plage,piscine,nature,parc-loisirs" },
  night: { categories: "lounge,rooftop,bar,club" },
  friends: { categories: "bowling,karting,paintball,escape-game,karaoke,jeux,sport-loisir" },
  relax: { categories: "spa" },
  popular: { sort: "popularity" },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Encore debout";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function Discover() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { groups, catName, capabilities, cities } = useMeta();
  const escapades = cities.filter((c) => c.slug !== "abidjan");
  const { apiOrigin, searchOrigin, originLabel, choice, gpsState } = useSettings();
  const [q, setQ] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const originKey = JSON.stringify(apiOrigin);

  // `district` n'est pas (encore) dans le contrat de /recommendations/home : envoyé à titre indicatif.
  const district = searchOrigin.kind === "city" ? searchOrigin.district : null;
  const home = useAsync(() => api.recommendations.home({ ...apiOrigin, district: district ?? undefined }), [originKey, district, user?.id]);
  const gems = useAsync(() => api.places.gems(apiOrigin.city ?? undefined), [originKey, user?.plan]);

  const submit = () => {
    const t = q.trim();
    if (!t) return router.push("/search");
    router.push({ pathname: "/search", params: { q: t } });
    setQ("");
  };

  const firstName = user?.display_name.split(/\s|\(/)[0];
  const gemList = gems.data ?? [];
  const lockedCount = gemList.filter((g) => g.locked).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space[3], paddingBottom: space[7] }}
        refreshControl={
          <RefreshControl
            refreshing={home.refreshing}
            onRefresh={() => {
              home.refresh();
              gems.refresh();
            }}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface2}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Lueur d'ambiance */}
        <LinearGradient colors={[colors.glowAccent, "rgba(255,138,61,0)"]} style={s.glow} pointerEvents="none" />

        <View style={s.head}>
          <PressableScale onPress={() => setLocOpen(true)} accessibilityRole="button" accessibilityLabel={`Position : ${originLabel}. Changer`} style={s.locChip}>
            <Icon name={choice.kind === "gps" ? "locate" : "pin"} size={16} color={colors.accent} />
            <Txt variant="label" numberOfLines={1} style={{ maxWidth: 210 }}>
              {originLabel}
            </Txt>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </PressableScale>
          <PressableScale onPress={() => router.push("/me")} accessibilityRole="button" accessibilityLabel={user ? "Mon profil" : "Se connecter"} style={s.avatar}>
            {user ? (
              <Txt variant="label" color={colors.onAccent} style={{ fontFamily: fonts.bodyHeavy }}>
                {initials(user.display_name)}
              </Txt>
            ) : (
              <Icon name="user" size={20} color={colors.text} />
            )}
          </PressableScale>
        </View>

        <Animated.View entering={FadeInDown.duration(420)} style={{ paddingHorizontal: GUTTER, gap: 6, marginTop: space[4] }}>
          <Txt variant="label" color={colors.accentSoft}>
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </Txt>
          <Txt variant="hero" accessibilityRole="header">
            Où sort-on{"\n"}aujourd&apos;hui ?
          </Txt>
        </Animated.View>

        <View style={{ paddingHorizontal: GUTTER, marginTop: space[4] }}>
          <SearchBar
            value={q}
            onChangeText={setQ}
            onSubmitEditing={submit}
            onClear={() => setQ("")}
            placeholder="Bowling, maquis, plage à Bassam…"
            right={
              <PressableScale onPress={() => router.push("/search")} accessibilityRole="button" accessibilityLabel="Filtres de recherche" style={s.filterBtn}>
                <Icon name="sliders" size={18} color={colors.onAccent} />
              </PressableScale>
            }
          />
        </View>

        {/* Agenda : ce qui se passe ce week-end (soirées, concerts, brunchs…) */}
        {home.data?.agenda?.items.length ? (
          <Animated.View entering={FadeInDown.duration(420)} style={{ marginTop: space[5], gap: space[3] }}>
            <View style={{ paddingHorizontal: GUTTER }}>
              <SectionTitle
                title={home.data.agenda.title}
                subtitle="Soirées, concerts, brunchs…"
                action={
                  <PressableScale onPress={() => router.push("/events")} accessibilityRole="button" accessibilityLabel="Voir tout l'agenda" hitSlop={8}>
                    <Txt variant="label" color={colors.accent}>
                      Tout voir
                    </Txt>
                  </PressableScale>
                }
              />
            </View>
            <FlatList
              horizontal
              data={home.data.agenda.items}
              keyExtractor={(e) => e.id}
              showsHorizontalScrollIndicator={false}
              snapToInterval={264 + 14}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
              renderItem={({ item }) => <EventTile e={item} />}
            />
          </Animated.View>
        ) : null}

        {/* Envies : ce que l'on veut faire, puis le type de lieu */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: space[5], gap: space[3] }}>
          <SectionTitle title="Tu as envie de…" />
          <View style={s.envies}>
            {groups.map((g) => (
              <PressableScale
                key={g.slug}
                onPress={() => router.push({ pathname: "/search", params: { categories: g.categories.join(",") } })}
                accessibilityRole="button"
                accessibilityLabel={g.name}
                style={s.envie}
              >
                <View style={s.envieIcon}>
                  <Icon name={categoryIcon(g.icon)} size={20} color={colors.accent} />
                </View>
                <Txt variant="label" numberOfLines={2} style={{ flex: 1 }}>
                  {g.name}
                </Txt>
              </PressableScale>
            ))}
            {escapades.map((c) => (
              <PressableScale
                key={c.slug}
                onPress={() => router.push({ pathname: "/search", params: { q: c.name } })}
                accessibilityRole="button"
                accessibilityLabel={`Escapade à ${c.name}`}
                style={s.envie}
              >
                <View style={s.envieIcon}>
                  <Icon name="sun" size={20} color={colors.accent} />
                </View>
                <Txt variant="label" numberOfLines={2} style={{ flex: 1 }}>
                  Escapade à {c.name}
                </Txt>
              </PressableScale>
            ))}
          </View>
        </View>

        {choice.kind === "gps" && gpsState === "error" ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: space[4] }}>
            <Notice icon="info">Position indisponible pour l&apos;instant : résultats autour du centre de la ville.</Notice>
          </View>
        ) : null}

        {/* Ma soirée */}
        <PressableScale onPress={() => router.push("/soiree")} accessibilityRole="button" accessibilityLabel="Composer ma soirée" style={{ marginHorizontal: GUTTER, marginTop: space[5] }}>
          <LinearGradient colors={colors.gradAccent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.soiree}>
            <View style={s.soireeIcon}>
              <Icon name="route" size={24} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="h3">Ma soirée</Txt>
              <Txt variant="bodySm" color={colors.textMuted}>
                Un dîner, un verre, un son : on enchaîne les étapes pour toi.
              </Txt>
            </View>
            <Icon name="chevronRight" size={20} color={colors.accentSoft} />
          </LinearGradient>
        </PressableScale>

        {home.error ? (
          <ErrorState error={home.error} onRetry={home.reload} />
        ) : home.loading && !home.data ? (
          <View style={{ marginTop: space[6], gap: space[3] }}>
            <View style={{ paddingHorizontal: GUTTER }}>
              <Txt variant="h3" color={colors.textSubtle}>
                Chargement…
              </Txt>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}>
              <TileSkeleton />
              <TileSkeleton />
            </ScrollView>
          </View>
        ) : (
          home.data?.sections
            .filter((sec) => sec.items.length)
            .map((sec, i) => (
              <Animated.View key={sec.key} entering={FadeInDown.delay(80 * i).duration(420)} style={{ marginTop: space[6], gap: space[3] }}>
                <View style={{ paddingHorizontal: GUTTER }}>
                  <SectionTitle
                    title={sec.title}
                    subtitle={sec.subtitle}
                    action={
                      <PressableScale
                        onPress={() => router.push({ pathname: "/search", params: SECTION_SEARCH[sec.key] ?? {} })}
                        accessibilityRole="button"
                        accessibilityLabel={`Tout voir : ${sec.title}`}
                        hitSlop={8}
                      >
                        <Txt variant="label" color={colors.accent}>
                          Tout voir
                        </Txt>
                      </PressableScale>
                    }
                  />
                </View>
                <FlatList
                  horizontal
                  data={sec.items}
                  keyExtractor={(p) => `${sec.key}-${p.id}`}
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={264 + 14}
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
                  renderItem={({ item }) => <PlaceTile p={item} catName={catName} />}
                />
                {i === 0 && gemList.length ? (
                  <PressableScale onPress={() => router.push("/gems")} accessibilityRole="button" accessibilityLabel="Voir les pépites" style={{ marginHorizontal: GUTTER, marginTop: space[5] }}>
                    <LinearGradient colors={colors.gradGold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.gems}>
                      <View style={s.gemIcon}>
                        <Icon name="gem" size={22} color={colors.gold} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Txt variant="overline" color={colors.gold}>
                          PÉPITES INSIDER
                        </Txt>
                        <Txt variant="title">
                          {lockedCount
                            ? `${lockedCount} adresse${lockedCount > 1 ? "s" : ""} cachée${lockedCount > 1 ? "s" : ""} près de toi`
                            : `${gemList.length} pépite${gemList.length > 1 ? "s" : ""} débloquée${gemList.length > 1 ? "s" : ""}`}
                        </Txt>
                        <Txt variant="caption" color={colors.textMuted}>
                          {lockedCount ? "Sélectionnées par nos curateurs, réservées aux membres." : "Ton offre Insider te donne accès à tout."}
                        </Txt>
                      </View>
                      <Icon name="chevronRight" size={20} color={colors.gold} />
                    </LinearGradient>
                  </PressableScale>
                ) : null}
              </Animated.View>
            ))
        )}

        {capabilities?.demo_data ? (
          <View style={{ paddingHorizontal: GUTTER, marginTop: space[6] }}>
            <Notice icon="info">Données de démonstration fictives : les lieux, avis et horaires servent à illustrer l&apos;application.</Notice>
          </View>
        ) : null}
      </ScrollView>

      <Sheet visible={locOpen} onClose={() => setLocOpen(false)} title="D'où pars-tu ?" subtitle="Sert à trier les lieux par distance à vol d'oiseau.">
        <LocationPicker onDone={() => setLocOpen(false)} />
      </Sheet>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  glow: { position: "absolute", top: -120, left: -60, right: -60, height: 420, borderRadius: 300 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: GUTTER },
  locChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    maxWidth: "80%",
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  filterBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  soiree: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  soireeIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  envies: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  envie: {
    width: "48.5%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  envieIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
  gems: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldBorder },
  gemIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.goldTint, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.goldBorder },
}));
