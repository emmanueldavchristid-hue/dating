import { StyleSheet, View } from "react-native";
import { useAppearance, type ThemeChoice } from "@/context/AppearanceContext";
import { colors, radius, themed } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { PressableScale, Txt } from "./ui";

const OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: "dark", label: "Sombre", icon: "moon" },
  { value: "light", label: "Clair", icon: "sun" },
  { value: "system", label: "Comme le téléphone", icon: "settings" },
];

/** Choix de l'apparence : au premier lancement et dans le profil, modifiable à tout moment. */
export function ThemePicker() {
  const { choice, setChoice } = useAppearance();
  return (
    <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel="Apparence de l'application">
      {OPTIONS.map((o) => {
        const on = choice === o.value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => setChoice(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[s.opt, on ? s.on : null]}
          >
            <Icon name={o.icon} size={18} color={on ? colors.accent : colors.textMuted} />
            <Txt variant="caption" color={on ? colors.text : colors.textMuted} numberOfLines={2} style={{ textAlign: "center" }}>
              {o.label}
            </Txt>
          </PressableScale>
        );
      })}
    </View>
  );
}

const s = themed(() =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: 8 },
    opt: {
      flex: 1,
      minHeight: 66,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 6,
      borderRadius: radius.md,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.border,
    },
    on: { borderColor: colors.accent, backgroundColor: colors.accentTint },
  }),
);
