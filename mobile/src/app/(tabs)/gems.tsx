import { LinearGradient } from "expo-linear-gradient";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { PlaceRow } from "@/components/PlaceCard";
import { UpsellCard } from "@/components/Premium";
import { Pill, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api } from "@/lib/api";
import { planLabel } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function Gems() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { catName } = useMeta();
  const { apiOrigin } = useSettings();
  const gems = useAsync(() => api.places.gems(apiOrigin.city ?? undefined), [JSON.stringify(apiOrigin), user?.id, user?.plan]);
  const list = gems.data ?? [];
  const locked = list.filter((g) => g.locked).length;
  const insider = user?.plan === "insider";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: space[7], gap: 12 }}
        refreshControl={<RefreshControl refreshing={gems.refreshing} onRefresh={gems.refresh} tintColor={colors.gold} colors={[colors.gold]} />}
        ListHeaderComponent={
          <View>
            <LinearGradient colors={["rgba(233,196,106,0.16)", "rgba(233,196,106,0)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View style={{ paddingTop: insets.top + space[4], paddingHorizontal: GUTTER, gap: space[3], paddingBottom: space[4] }}>
              <View style={s.badge}>
                <Icon name="gem" size={26} color={colors.gold} />
              </View>
              <Txt variant="overline" color={colors.gold}>
                SÉLECTION INSIDER
              </Txt>
              <Txt variant="h1" accessibilityRole="header">
                Les pépites
              </Txt>
              <Txt variant="body" color={colors.textMuted}>
                Des lieux rares repérés par nos curateurs : peu connus, pas sponsorisés.
              </Txt>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Pill label={user ? `Ton offre : ${planLabel(user.plan)}` : "Non connecté"} tone={insider ? "gold" : "neutral"} icon={insider ? "crown" : "user"} />
                {list.length ? <Pill label={insider ? `${list.length} débloquées` : `${locked} verrouillée${locked > 1 ? "s" : ""}`} tone="gold" icon={insider ? "check" : "lock"} /> : null}
              </View>
            </View>
            {!insider && list.length ? (
              <View style={{ paddingHorizontal: GUTTER, marginBottom: space[4] }}>
                <UpsellCard
                  title="Débloque les pépites"
                  body="Avec Insider, découvre le nom, l'adresse et la fiche complète de chaque pépite, et compose des soirées jusqu'à 5 étapes."
                  cta="Voir l'offre Insider"
                />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).duration(340)} style={{ paddingHorizontal: GUTTER }}>
            <PlaceRow p={item} catName={catName} />
          </Animated.View>
        )}
        ListEmptyComponent={
          gems.error ? (
            <ErrorState error={gems.error} onRetry={gems.reload} />
          ) : gems.loading ? (
            <View style={{ paddingHorizontal: GUTTER, gap: 12 }}>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </View>
          ) : (
            <EmptyState icon="gem" tone="gold" title="Pas encore de pépite ici" body="Nos curateurs n'ont pas encore sélectionné de pépite dans cette ville." />
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.goldBg,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    alignItems: "center",
    justifyContent: "center",
  },
});
