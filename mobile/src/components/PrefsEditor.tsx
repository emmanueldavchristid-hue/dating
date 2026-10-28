import { StyleSheet, View } from "react-native";
import { useMeta } from "@/context/MetaContext";
import { BUDGET_PRESETS, toggleIn } from "@/lib/filters";
import type { Preferences } from "@/lib/types";
import { colors, radius, space } from "@/theme/tokens";
import { categoryIcon, Icon } from "./Icon";
import { Chip, PressableScale, Txt } from "./ui";

/** Édition des préférences (onboarding + profil). */
export function PrefsEditor({ value, onChange }: { value: Preferences; onChange: (p: Preferences) => void }) {
  const { categories, ambiances, cities } = useMeta();
  return (
    <View style={{ gap: space[5] }}>
      <View style={{ gap: space[3] }}>
        <Txt variant="overline" color={colors.textSubtle}>
          CE QUI TE FAIT SORTIR
        </Txt>
        <View style={s.grid}>
          {categories.map((c) => {
            const on = value.categories.includes(c.slug);
            return (
              <PressableScale
                key={c.slug}
                onPress={() => onChange({ ...value, categories: toggleIn(value.categories, c.slug) })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.name}
                scaleTo={0.96}
                style={[s.cat, on ? s.catOn : null]}
              >
                <Icon name={categoryIcon(c.icon || c.slug)} size={22} color={on ? colors.accent : colors.textMuted} />
                <Txt variant="label" color={on ? colors.text : colors.textMuted} numberOfLines={2} style={{ flex: 1 }}>
                  {c.name}
                </Txt>
                {on ? (
                  <View style={s.check}>
                    <Icon name="check" size={12} color={colors.onAccent} strokeWidth={3} />
                  </View>
                ) : null}
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View style={{ gap: space[3] }}>
        <Txt variant="overline" color={colors.textSubtle}>
          AMBIANCES
        </Txt>
        <View style={s.wrap}>
          {ambiances.map((a) => (
            <Chip key={a.slug} label={a.name} selected={value.ambiances.includes(a.slug)} onPress={() => onChange({ ...value, ambiances: toggleIn(value.ambiances, a.slug) })} />
          ))}
        </View>
      </View>

      <View style={{ gap: space[3] }}>
        <Txt variant="overline" color={colors.textSubtle}>
          BUDGET MAX PAR PERSONNE (FCFA)
        </Txt>
        <View style={s.wrap}>
          <Chip label="Sans limite" selected={value.budget_max_fcfa == null} onPress={() => onChange({ ...value, budget_max_fcfa: null })} />
          {BUDGET_PRESETS.map((b) => (
            <Chip key={b.value} label={b.label} selected={value.budget_max_fcfa === b.value} onPress={() => onChange({ ...value, budget_max_fcfa: b.value })} />
          ))}
        </View>
      </View>

      <View style={{ gap: space[3] }}>
        <Txt variant="overline" color={colors.textSubtle}>
          TA VILLE
        </Txt>
        <View style={s.wrap}>
          {cities.map((c) => (
            <Chip key={c.slug} label={c.name} icon="pin" selected={value.home_city === c.slug} onPress={() => onChange({ ...value, home_city: c.slug })} />
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cat: {
    width: "48.4%",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catOn: { backgroundColor: colors.accentTint, borderColor: colors.accent },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
