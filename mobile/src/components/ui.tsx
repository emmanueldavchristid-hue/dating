import * as Haptics from "expo-haptics";
import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { colors, fonts, radius, space, type as typeScale, type TypeVariant } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";

// ---------------------------------------------------------------------------
// Texte

export function Txt({
  variant = "body",
  color = colors.text,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; color?: string }) {
  return <Text maxFontSizeMultiplier={1.35} {...rest} style={[typeScale[variant], { color }, style]} />;
}

// ---------------------------------------------------------------------------
// Pressable avec retour « scale 0.98 »

const APressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
};

export function PressableScale({ style, scaleTo = 0.98, haptic, onPressIn, onPressOut, onPress, disabled, ...rest }: PressableScaleProps) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        s.value = withTiming(scaleTo, { duration: 90 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 16, stiffness: 260 });
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) hapticLight();
        onPress?.(e);
      }}
      style={[style, a, disabled ? { opacity: 0.5 } : null]}
    />
  );
}

export function hapticLight() {
  if (Platform.OS === "web") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
export function hapticSuccess() {
  if (Platform.OS === "web") return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// ---------------------------------------------------------------------------
// Boutons

type ButtonVariant = "primary" | "secondary" | "ghost" | "gold" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  size = "lg",
  style,
  accessibilityHint,
  haptic,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: "lg" | "md" | "sm";
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  haptic?: boolean;
  full?: boolean;
}) {
  const v = BUTTON_VARIANTS[variant];
  const h = size === "lg" ? 54 : size === "md" ? 46 : 38;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic={haptic}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[
        styles.btn,
        { height: h, backgroundColor: v.bg, borderColor: v.border, paddingHorizontal: size === "sm" ? 14 : 20 },
        full ? null : { alignSelf: "flex-start" },
        variant === "primary" && !disabled ? styles.btnGlow : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 16 : 19} color={v.fg} /> : null}
          <Txt variant={size === "sm" ? "label" : "title"} color={v.fg} style={{ fontFamily: fonts.bodyBold }} numberOfLines={1}>
            {label}
          </Txt>
        </>
      )}
    </PressableScale>
  );
}

const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
  secondary: { bg: colors.surface3, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: "transparent", fg: colors.text, border: colors.borderStrong },
  gold: { bg: colors.gold, fg: "#1E1608", border: colors.gold },
  danger: { bg: colors.dangerTint, fg: colors.danger, border: "rgba(255,107,107,0.35)" },
};

export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  color = colors.text,
  bg = colors.surface3,
  border = colors.borderStrong,
  fill,
  disabled,
  haptic,
  style,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  bg?: string;
  border?: string;
  fill?: string;
  disabled?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic={haptic}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, borderColor: border, borderWidth: 1 },
        styles.center,
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={color} fill={fill} />
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Puces

export function Chip({
  label,
  selected,
  onPress,
  icon,
  tone = "accent",
  trailing,
  size = "md",
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: "accent" | "gold";
  trailing?: IconName;
  size?: "md" | "sm";
  accessibilityLabel?: string;
}) {
  const sel = tone === "gold" ? { bg: colors.goldBg, border: colors.gold, fg: colors.gold } : { bg: colors.accentTint, border: colors.accent, fg: colors.accentSoft };
  const fg = selected ? sel.fg : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.95}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        size === "sm" ? { height: 34, paddingHorizontal: 12 } : null,
        { backgroundColor: selected ? sel.bg : colors.surface2, borderColor: selected ? sel.border : colors.border },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? sel.fg : colors.textMuted} /> : null}
      <Txt variant="label" color={fg} numberOfLines={1}>
        {label}
      </Txt>
      {trailing ? <Icon name={trailing} size={14} color={fg} /> : null}
    </PressableScale>
  );
}

/** Petite étiquette (badge). */
export function Pill({
  label,
  tone = "neutral",
  icon,
  style,
}: {
  label: string;
  tone?: "neutral" | "accent" | "gold" | "success" | "info" | "demo" | "danger" | "glass";
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = PILL_TONES[tone];
  return (
    <View
      style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }, style]}
      accessible
      accessibilityLabel={label}
    >
      {icon ? <Icon name={icon} size={12} color={t.fg} strokeWidth={2.2} /> : null}
      <Txt variant="caption" color={t.fg} numberOfLines={1} style={{ fontFamily: fonts.bodyBold }}>
        {label}
      </Txt>
    </View>
  );
}

const PILL_TONES = {
  neutral: { bg: colors.surface3, fg: colors.textMuted, border: colors.border },
  accent: { bg: colors.accentTint, fg: colors.accentSoft, border: "rgba(255,138,61,0.3)" },
  gold: { bg: colors.goldBg, fg: colors.gold, border: colors.goldBorder },
  success: { bg: colors.successTint, fg: colors.success, border: "rgba(127,217,168,0.28)" },
  info: { bg: colors.infoTint, fg: colors.infoSoft, border: "rgba(76,116,255,0.3)" },
  demo: { bg: "rgba(14,15,19,0.78)", fg: colors.text, border: "rgba(244,241,234,0.22)" },
  danger: { bg: colors.dangerTint, fg: colors.danger, border: "rgba(255,107,107,0.3)" },
  glass: { bg: "rgba(14,15,19,0.62)", fg: colors.text, border: "rgba(244,241,234,0.14)" },
} as const;

// ---------------------------------------------------------------------------
// Champs

export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string | null; hint?: string; icon?: IconName }
>(function Field({ label, error, hint, icon, style, ...rest }, ref) {
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="label" color={colors.textMuted}>
        {label}
      </Txt>
      <View style={[styles.field, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Icon name={icon} size={18} color={colors.textSubtle} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          accessibilityLabel={label}
          maxFontSizeMultiplier={1.3}
          {...rest}
          style={[styles.input, style]}
        />
      </View>
      {error ? (
        <Txt variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : hint ? (
        <Txt variant="caption" color={colors.textSubtle}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Blocs

export function Card({ children, style, tone = "default" }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: "default" | "gold" | "accent" }) {
  return (
    <View
      style={[
        styles.card,
        tone === "gold" ? { backgroundColor: colors.goldBg, borderColor: colors.goldBorder } : null,
        tone === "accent" ? { backgroundColor: colors.accentTint, borderColor: "rgba(255,138,61,0.3)" } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string | null; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="h3" accessibilityRole="header">
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="bodySm" color={colors.textMuted} numberOfLines={2}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Ligne de liste (réglages, profil). */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  danger,
  right,
  hint,
  disabled,
}: {
  icon: IconName;
  label: string;
  value?: string | null;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  const fg = danger ? colors.danger : colors.text;
  const body = (
    <>
      <View style={[styles.rowIcon, danger ? { backgroundColor: colors.dangerTint } : null]}>
        <Icon name={icon} size={18} color={danger ? colors.danger : colors.accentSoft} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title" color={fg} style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>
          {label}
        </Txt>
        {hint ? (
          <Txt variant="caption" color={colors.textSubtle}>
            {hint}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt variant="bodySm" color={colors.textMuted} numberOfLines={1} style={{ maxWidth: 140 }}>
          {value}
        </Txt>
      ) : null}
      {right ?? (onPress ? <Icon name="chevronRight" size={18} color={colors.textSubtle} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{body}</View>;
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} style={styles.listRow}>
      {body}
    </PressableScale>
  );
}

export function Toggle({ value, onChange, label, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const x = useAnimatedStyle(() => ({ transform: [{ translateX: withTiming(value ? 20 : 0, { duration: 160 }) }] }));
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={[styles.toggle, { backgroundColor: value ? colors.accent : colors.surfaceHover, opacity: disabled ? 0.5 : 1 }]}
    >
      <Animated.View style={[styles.knob, x]} />
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  btnGlow: {
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 16, paddingVertical: 12 },
  card: {
    backgroundColor: colors.surface1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space[4],
  },
  sectionTitle: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingVertical: 8 },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  toggle: { width: 50, height: 30, borderRadius: 15, padding: 3, justifyContent: "center" },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text },
});
