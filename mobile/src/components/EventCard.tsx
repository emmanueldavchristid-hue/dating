import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { formatBudgetRange, shortWhen } from "@/lib/format";
import type { EventCard as Ev } from "@/lib/types";
import { colors, radius, themed } from "@/theme/tokens";
import { Cover } from "./Cover";
import { categoryIcon, Icon } from "./Icon";
import { PressableScale, Txt } from "./ui";

/** Vignette d'une sortie (soirée, concert…) : quand, quoi, où. Ouvre la fiche du lieu. */
export function EventTile({ e, width = 264 }: { e: Ev; width?: number }) {
  const price = e.price_fcfa != null ? (e.price_fcfa === 0 ? "Entrée libre" : formatBudgetRange(e.price_fcfa, e.price_fcfa)) : null;
  return (
    <PressableScale
      onPress={() => router.push(`/place/${e.place.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={`${e.kind_label} : ${e.title}, ${shortWhen(e.starts_at)}, à ${e.place.name}`}
      style={[s.tile, { width }]}
    >
      <Cover url={e.place.cover.url} credit={e.place.cover.credit} gradient={e.place.cover.gradient} alt={e.place.cover.alt} glyph={categoryIcon(e.place.categories[0])} style={s.cover}>
        <View style={s.when}>
          <Icon name="calendar" size={13} color={colors.onAccent} />
          <Txt variant="label" color={colors.onAccent} style={{ fontSize: 12 }}>
            {shortWhen(e.starts_at)}
          </Txt>
        </View>
      </Cover>
      <View style={{ padding: 12, gap: 3 }}>
        <Txt variant="overline" color={colors.accentSoft}>
          {e.kind_label.toUpperCase()}
        </Txt>
        <Txt variant="title" numberOfLines={2}>
          {e.title}
        </Txt>
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {[e.place.name, e.place.district].filter(Boolean).join(" · ")}
          {price ? ` · ${price}` : ""}
        </Txt>
      </View>
    </PressableScale>
  );
}

const s = themed(() =>
  StyleSheet.create({
    tile: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
    cover: { height: 132 },
    when: {
      position: "absolute",
      left: 10,
      top: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 9,
      height: 26,
      borderRadius: radius.pill,
      backgroundColor: colors.accent,
    },
  }),
);
