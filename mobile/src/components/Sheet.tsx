import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, GUTTER, radius, space } from "@/theme/tokens";
import { IconButton, Txt } from "./ui";

/** Feuille modale du bas (filtres, collections, signalement…). */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  tone = "default",
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "gold";
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const p = useSharedValue(0);
  // Montage immédiat à l'ouverture (état dérivé), démontage après l'animation de fermeture.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      p.set(withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
      return;
    }
    p.set(withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }));
    const t = setTimeout(() => setMounted(false), 210);
    return () => clearTimeout(t);
  }, [visible, p]);

  const backdrop = useAnimatedStyle(() => ({ opacity: p.value }));
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.value) * 520 }] }));

  if (!mounted) return null;
  const gold = tone === "gold";
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdrop]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View
          accessibilityViewIsModal
          style={[
            s.panel,
            { maxHeight: height * 0.9, paddingBottom: Math.max(insets.bottom, space[4]) },
            gold ? { borderColor: colors.goldBorder, backgroundColor: "#17140E" } : null,
            panel,
          ]}
        >
          <View style={s.grabber} />
          <View style={s.header}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="h2" accessibilityRole="header" color={gold ? colors.gold : colors.text}>
                {title}
              </Txt>
              {subtitle ? (
                <Txt variant="bodySm" color={colors.textMuted}>
                  {subtitle}
                </Txt>
              ) : null}
            </View>
            <IconButton icon="x" label="Fermer" onPress={onClose} size={40} />
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: space[4], gap: space[4] }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderHover,
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingTop: space[3],
    paddingBottom: space[4],
  },
  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    gap: space[3],
  },
});
