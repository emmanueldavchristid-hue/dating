import { LinearGradient } from "expo-linear-gradient";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, errorMessage } from "@/lib/api";
import { colors, radius, space } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Button, Txt } from "./ui";

// ---------------------------------------------------------------------------
// Squelette « shimmer »

export function Skeleton({
  width = "100%",
  height = 16,
  r = 10,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: -260 + t.value * 620 }] }));
  return (
    <View
      style={[{ width, height, borderRadius: r, backgroundColor: colors.surface2, overflow: "hidden" }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { width: 260 }, a]}>
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.055)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function TileSkeleton({ width = 264 }: { width?: number }) {
  return (
    <View style={{ width, gap: 10 }}>
      <Skeleton height={176} r={22} />
      <Skeleton width="70%" height={18} />
      <Skeleton width="50%" height={13} />
    </View>
  );
}

export function RowSkeleton() {
  return (
    <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
      <Skeleton width={92} height={92} r={18} />
      <View style={{ flex: 1, gap: 9 }}>
        <Skeleton width="75%" height={17} />
        <Skeleton width="55%" height={13} />
        <Skeleton width="40%" height={13} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// États vides / erreurs

export function EmptyState({
  icon,
  title,
  body,
  action,
  tone = "accent",
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  tone?: "accent" | "gold";
}) {
  const gold = tone === "gold";
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={s.empty}>
      <View style={[s.emptyIcon, gold ? { backgroundColor: colors.goldBg, borderColor: colors.goldBorder } : null]}>
        <Icon name={icon} size={28} color={gold ? colors.gold : colors.accentSoft} />
      </View>
      <Txt variant="h3" style={{ textAlign: "center" }}>
        {title}
      </Txt>
      {body ? (
        <Txt variant="body" color={colors.textMuted} style={{ textAlign: "center", maxWidth: 320 }}>
          {body}
        </Txt>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          variant={gold ? "gold" : "primary"}
          size="md"
          full={false}
          style={{ marginTop: space[2], alignSelf: "center" }}
        />
      ) : null}
    </Animated.View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof ApiError && error.kind === "network";
  return (
    <EmptyState
      icon={offline ? "wifiOff" : "info"}
      title={offline ? "Hors connexion" : "Oups, ça n'a pas marché"}
      body={offline ? "Impossible de joindre le serveur. Vérifie ta connexion (ou l'adresse de l'API) puis réessaie." : errorMessage(error)}
      action={onRetry ? { label: "Réessayer", onPress: onRetry, icon: "refresh" } : undefined}
    />
  );
}

/** Bandeau d'information discret (honnêteté, démo…). */
export function Notice({ icon = "info", children, tone = "neutral" }: { icon?: IconName; children: ReactNode; tone?: "neutral" | "gold" | "info" }) {
  const t =
    tone === "gold"
      ? { bg: colors.goldBg, border: colors.goldBorder, fg: colors.gold }
      : tone === "info"
        ? { bg: colors.infoTint, border: "rgba(76,116,255,0.3)", fg: colors.infoSoft }
        : { bg: colors.surface1, border: colors.border, fg: colors.textMuted };
  return (
    <View style={[s.notice, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Icon name={icon} size={17} color={t.fg} />
      <Txt variant="bodySm" color={tone === "neutral" ? colors.textMuted : t.fg} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Toasts

type ToastMsg = { id: number; text: string; icon: IconName };
const ToastCtx = createContext<(text: string, icon?: IconName) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((text: string, icon: IconName = "check") => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ id: Date.now(), text, icon });
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  const value = useMemo(() => show, [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {msg ? (
        <Animated.View
          key={msg.id}
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(180)}
          pointerEvents="none"
          style={[s.toast, { bottom: insets.bottom + 96 }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Icon name={msg.icon} size={18} color={colors.accent} />
          <Txt variant="label" style={{ flexShrink: 1 }}>
            {msg.text}
          </Txt>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: "center", gap: space[3], paddingVertical: space[7], paddingHorizontal: space[5] },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.accentTint,
    borderWidth: 1,
    borderColor: "rgba(255,138,61,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[1],
  },
  notice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  toast: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: radius.pill,
    backgroundColor: colors.surface3,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
});
