import { router } from "expo-router";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/feedback";
import { Cover } from "@/components/Cover";
import { categoryIcon, Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/Screen";
import { PressableScale, Txt } from "@/components/ui";
import { useSettings } from "@/context/SettingsContext";
import { api } from "@/lib/api";
import { dayLabel, formatBudgetRange, hourLabel } from "@/lib/format";
import type { EventCard } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, radius, space, themed } from "@/theme/tokens";

/** Agenda des sorties : regroupé par jour, chaque sortie ouvre la fiche de son lieu. */
export default function Events() {
  const insets = useSafeAreaInsets();
  const { apiOrigin } = useSettings();
  const res = useAsync(() => api.events.list(apiOrigin), [JSON.stringify(apiOrigin)]);
  const days: { title: string; data: EventCard[] }[] = [];
  for (const e of res.data?.items ?? []) {
    const t = dayLabel(e.starts_at);
    const last = days[days.length - 1];
    if (last && last.title === t) last.data.push(e);
    else days.push({ title: t, data: [e] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={res.data?.title ?? "Agenda"} />
      {res.error ? (
        <ErrorState error={res.error} onRetry={res.reload} />
      ) : res.loading ? (
        <View style={{ padding: GUTTER, gap: 12 }}>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : (
        <SectionList
          sections={days}
          keyExtractor={(e) => e.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: 10 }}
          refreshControl={<RefreshControl refreshing={res.refreshing} onRefresh={res.refresh} tintColor={colors.accent} />}
          renderSectionHeader={({ section }) => (
            <Txt variant="h3" style={{ marginTop: space[4], marginBottom: space[1] }} accessibilityRole="header">
              {section.title}
            </Txt>
          )}
          renderItem={({ item: e }) => <EventRow e={e} />}
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title="Pas encore de sortie annoncée"
              body="Les soirées, concerts et brunchs de la semaine apparaissent ici dès qu'ils sont annoncés."
              action={{ label: "Découvrir des lieux", onPress: () => router.push("/") }}
            />
          }
        />
      )}
    </View>
  );
}

function EventRow({ e }: { e: EventCard }) {
  const price = e.price_fcfa != null ? (e.price_fcfa === 0 ? "Entrée libre" : formatBudgetRange(e.price_fcfa, e.price_fcfa)) : null;
  return (
    <PressableScale
      onPress={() => router.push(`/place/${e.place.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={`${e.kind_label} : ${e.title}, à ${hourLabel(e.starts_at)}, ${e.place.name}`}
      style={s.row}
    >
      <Cover url={e.place.cover.url} gradient={e.place.cover.gradient} alt={e.place.cover.alt} glyph={categoryIcon(e.place.categories[0])} glyphSize={40} style={s.thumb} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="overline" color={colors.accentSoft}>
          {hourLabel(e.starts_at)} · {e.kind_label.toUpperCase()}
        </Txt>
        <Txt variant="title" numberOfLines={2}>
          {e.title}
        </Txt>
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {[e.place.name, e.place.district].filter(Boolean).join(" · ")}
          {price ? ` · ${price}` : ""}
        </Txt>
        {e.description ? (
          <Txt variant="caption" color={colors.textSubtle} numberOfLines={2}>
            {e.description}
          </Txt>
        ) : null}
      </View>
      <Icon name="chevronRight" size={18} color={colors.textSubtle} />
    </PressableScale>
  );
}

const s = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.border,
    },
    thumb: { width: 76, height: 76, borderRadius: radius.md, overflow: "hidden" },
  }),
);
