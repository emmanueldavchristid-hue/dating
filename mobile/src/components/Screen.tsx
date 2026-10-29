import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, GUTTER, space } from "@/theme/tokens";
import { IconButton, Txt } from "./ui";

export function goBack(fallback: string = "/") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/** En-tête de page empilée : retour + titre + action. */
export function ScreenHeader({
  title,
  subtitle,
  right,
  back = true,
  close,
  large,
  transparent,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  back?: boolean;
  close?: boolean;
  large?: boolean;
  transparent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + space[2] }, transparent ? { backgroundColor: "transparent" } : null]}>
      <View style={s.bar}>
        {back ? (
          <IconButton icon={close ? "x" : "chevronLeft"} label={close ? "Fermer" : "Retour"} onPress={() => goBack()} size={42} />
        ) : null}
        {!large ? (
          <Txt variant="h3" numberOfLines={1} style={{ flex: 1, textAlign: back ? "center" : "left" }} accessibilityRole="header">
            {title}
          </Txt>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={{ minWidth: back ? 42 : 0, alignItems: "flex-end" }}>{right}</View>
      </View>
      {large ? (
        <View style={{ gap: 4, marginTop: space[3] }}>
          <Txt variant="h1" accessibilityRole="header">
            {title}
          </Txt>
          {subtitle ? (
            <Txt variant="body" color={colors.textMuted}>
              {subtitle}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.screen, style]}>{children}</View>;
}

/** En-tête d'onglet (pas de retour). */
export function TabHeader({ title, subtitle, right, overline }: { title: string; subtitle?: string; right?: ReactNode; overline?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.tabHeader, { paddingTop: insets.top + space[4] }]}>
      <View style={{ flex: 1, gap: 4 }}>
        {overline ? (
          <Txt variant="overline" color={colors.accentSoft}>
            {overline.toUpperCase()}
          </Txt>
        ) : null}
        <Txt variant="h1" accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="body" color={colors.textMuted}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: GUTTER, paddingBottom: space[3], backgroundColor: colors.bg },
  bar: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 44 },
  tabHeader: { paddingHorizontal: GUTTER, paddingBottom: space[4], flexDirection: "row", alignItems: "flex-end", gap: space[3] },
});
