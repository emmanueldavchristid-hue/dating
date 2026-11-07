import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/Screen";
import { Txt } from "@/components/ui";
import { PRIVACY, TERMS } from "@/lib/legal";
import { colors, GUTTER, space } from "@/theme/tokens";

/** Conditions d'utilisation et politique de confidentialité. */
export default function Legal() {
  const insets = useSafeAreaInsets();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const d = doc === "cgu" ? TERMS : PRIVACY;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={d.title} />
      <ScrollView contentContainerStyle={{ padding: GUTTER, gap: space[4], paddingBottom: insets.bottom + space[6] }}>
        <Txt variant="caption" color={colors.textSubtle}>
          Mise à jour : {d.updated}
        </Txt>
        {d.sections.map((sec) => (
          <View key={sec.title} style={{ gap: 6 }}>
            <Txt variant="h3" accessibilityRole="header">
              {sec.title}
            </Txt>
            {sec.body.map((p, i) => (
              <Txt key={i} variant="bodySm" color={colors.textMuted} style={{ lineHeight: 21 }}>
                {p}
              </Txt>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
