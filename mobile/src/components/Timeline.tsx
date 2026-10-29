import { StyleSheet, View } from "react-native";
import { formatDistance } from "@/lib/format";
import type { PlaceCard } from "@/lib/types";
import { colors, radius } from "@/theme/tokens";
import { Icon } from "./Icon";
import { PlaceRow } from "./PlaceCard";
import { IconButton, Txt } from "./ui";

export type TimelineStep = { place: PlaceCard; leg_km: number | null; start_time?: string | null; note?: string | null };

/** Étapes d'une soirée avec trajets « à vol d'oiseau » entre elles. */
export function Timeline({
  steps,
  catName,
  editable,
  onMove,
  onRemove,
}: {
  steps: TimelineStep[];
  catName: Record<string, string>;
  editable?: boolean;
  onMove?: (from: number, to: number) => void;
  onRemove?: (i: number) => void;
}) {
  return (
    <View>
      {steps.map((st, i) => (
        <View key={`${st.place.id}-${i}`}>
          {i > 0 ? (
            <View style={s.leg}>
              <View style={s.legLine} />
              <Txt variant="caption" color={colors.textSubtle}>
                {st.leg_km != null ? `${formatDistance(st.leg_km)} à vol d'oiseau` : "Distance inconnue"}
              </Txt>
            </View>
          ) : null}
          <View style={s.stepRow}>
            <View style={s.num}>
              <Txt variant="label" color={colors.onAccent}>
                {i + 1}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              {st.start_time ? (
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <Icon name="clock" size={13} color={colors.accentSoft} />
                  <Txt variant="caption" color={colors.accentSoft}>
                    {st.start_time.slice(0, 5)}
                  </Txt>
                </View>
              ) : null}
              <PlaceRow p={st.place} catName={catName} />
              {st.note ? (
                <Txt variant="caption" color={colors.textMuted}>
                  {st.note}
                </Txt>
              ) : null}
              {editable ? (
                <View style={s.tools}>
                  <IconButton icon="arrowUp" label={`Monter l'étape ${i + 1}`} size={36} disabled={i === 0} onPress={() => onMove?.(i, i - 1)} />
                  <IconButton icon="arrowDown" label={`Descendre l'étape ${i + 1}`} size={36} disabled={i === steps.length - 1} onPress={() => onMove?.(i, i + 1)} />
                  <View style={{ flex: 1 }} />
                  <IconButton icon="trash" label={`Retirer l'étape ${i + 1}`} size={36} color={colors.danger} disabled={steps.length <= 1} onPress={() => onRemove?.(i)} />
                </View>
              ) : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  stepRow: { flexDirection: "row", gap: 12 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginTop: 34 },
  leg: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, height: 40 },
  legLine: { width: 2, height: 40, backgroundColor: colors.borderHover, borderRadius: 1, marginRight: 14 },
  tools: { flexDirection: "row", gap: 8, padding: 6, borderRadius: radius.md, backgroundColor: colors.surface1 },
});
