import type { ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius } from "@/theme/tokens";
import { Icon } from "./Icon";
import { PressableScale } from "./ui";

export function SearchBar({ value, onClear, right, style, ...rest }: TextInputProps & { onClear?: () => void; right?: ReactNode }) {
  return (
    <View style={s.bar}>
      <Icon name="search" size={20} color={colors.textMuted} />
      <TextInput
        value={value}
        placeholderTextColor={colors.textSubtle}
        selectionColor={colors.accent}
        returnKeyType="search"
        maxFontSizeMultiplier={1.3}
        accessibilityLabel="Rechercher"
        {...rest}
        style={[s.input, style]}
      />
      {value && onClear ? (
        <PressableScale onPress={onClear} accessibilityRole="button" accessibilityLabel="Effacer la recherche" hitSlop={10} style={s.clear}>
          <Icon name="x" size={14} color={colors.text} strokeWidth={2.4} />
        </PressableScale>
      ) : null}
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 6,
    gap: 10,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 16, height: "100%" },
  clear: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceHover, alignItems: "center", justifyContent: "center", marginRight: 6 },
});
