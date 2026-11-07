import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, SplashScreen, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "@/components/feedback";
import { AppearanceProvider, useAppearance } from "@/context/AppearanceContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { MetaProvider } from "@/context/MetaContext";
import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { colors } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Thème de navigation et barre d'état, recalculés à chaque thème (l'app est remontée au changement). */
function Themed({ children }: { children: React.ReactNode }) {
  const { mode } = useAppearance();
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.bg, primary: colors.accent, text: colors.text, border: colors.border },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {children}
    </ThemeProvider>
  );
}

function RootStack() {
  const { ready: authReady } = useAuth();
  const { ready, onboarded } = useSettings();
  const booted = authReady && ready;

  useEffect(() => {
    if (booted) SplashScreen.hideAsync().catch(() => {});
  }, [booted]);

  if (!booted) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "slide_from_right" }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
        <Stack.Screen name="search" />
        <Stack.Screen name="place/[id]" />
        <Stack.Screen name="favorites" />
        <Stack.Screen name="events" />
        <Stack.Screen name="collections" />
        <Stack.Screen name="collection/[id]" />
        <Stack.Screen name="soiree/index" />
        <Stack.Screen name="soiree/[id]" />
        <Stack.Screen name="preferences" />
        <Stack.Screen name="about" />
        <Stack.Screen name="login" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="register" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="premium" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <Themed>
          <AuthProvider>
            <MetaProvider>
              <SettingsProvider>
                <ToastProvider>
                  <RootStack />
                </ToastProvider>
              </SettingsProvider>
            </MetaProvider>
          </AuthProvider>
          </Themed>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
