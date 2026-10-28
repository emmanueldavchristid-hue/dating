import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/Icon";
import { hapticLight, PressableScale, Txt } from "@/components/ui";
import { colors, fonts } from "@/theme/tokens";

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Découvrir", icon: "compass" },
  map: { label: "Carte", icon: "map" },
  gems: { label: "Pépites", icon: "gem" },
  concierge: { label: "Concierge", icon: "sparkles" },
  me: { label: "Moi", icon: "user" },
};

function TabItem({ focused, name, onPress }: { focused: boolean; name: string; onPress: () => void }) {
  const t = TABS[name]!;
  const gold = name === "gems";
  const activeColor = gold ? colors.gold : colors.accent;
  const pill = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 180 }),
    transform: [{ scaleX: withTiming(focused ? 1 : 0.6, { duration: 220 }) }],
  }));
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.92}
      accessibilityRole="tab"
      accessibilityLabel={t.label}
      accessibilityState={{ selected: focused }}
      style={s.item}
      testID={`tab-${name}`}
    >
      <View style={s.iconWrap}>
        <Animated.View style={[s.pill, { backgroundColor: gold ? "rgba(233,196,106,0.14)" : colors.accentTint }, pill]} />
        <Icon name={t.icon} size={22} color={focused ? activeColor : colors.textMuted} strokeWidth={focused ? 2.1 : 1.8} />
      </View>
      <Txt
        variant="caption"
        color={focused ? (gold ? colors.gold : colors.text) : colors.textSubtle}
        style={{ fontFamily: focused ? fonts.bodyBold : fonts.bodySemi, fontSize: 11 }}
        numberOfLines={1}
      >
        {t.label}
      </Txt>
    </PressableScale>
  );
}

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        return (
          <TabItem
            key={route.key}
            name={route.name}
            focused={focused}
            onPress={() => {
              if (focused) return;
              hapticLight();
              navigateToTab(route.key);
            }}
          />
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="gems" />
      <Tabs.Screen name="concierge" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "rgba(18,19,24,0.98)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  item: { flex: 1, alignItems: "center", gap: 4, minHeight: 50, justifyContent: "center" },
  iconWrap: { width: 56, height: 30, alignItems: "center", justifyContent: "center" },
  pill: { ...StyleSheet.absoluteFill, borderRadius: 15 },
});
