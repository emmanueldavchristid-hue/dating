/** Design system — « concierge » premium, en sombre (par défaut) ou en clair (miroir de web/src/styles/tokens.css).
 *
 * `colors` est la palette ACTIVE : `applyTheme()` la remplace et l'app est remontée, si bien que les styles
 * (créés avec `themed()`) et les couleurs lues dans les composants suivent le thème choisi. */
const DARK = {
  bg: "#0E0F13",
  bgElevated: "#121318",
  surface1: "#15171D",
  surface2: "#181A21",
  surface3: "#1B1D25",
  surfaceHover: "#20232C",
  border: "#262933",
  borderStrong: "#2A2D37",
  borderHover: "#3A3E4A",

  text: "#F4F1EA",
  textMuted: "#A3A6B2",
  textSubtle: "#8B8E9A",

  accent: "#FF8A3D",
  accentPress: "#F07A2C",
  onAccent: "#1A0F05",
  accentSoft: "#FFB07A",
  accentTint: "rgba(255, 138, 61, 0.12)",
  accentTintStrong: "rgba(255, 138, 61, 0.2)",
  accentBorder: "rgba(255, 138, 61, 0.3)",

  gold: "#E9C46A",
  goldBg: "#2B2416",
  goldBorder: "#4A3D20",
  goldTint: "rgba(233, 196, 106, 0.12)",
  onGold: "#1E1608",

  success: "#7FD9A8",
  successTint: "rgba(127, 217, 168, 0.12)",
  info: "#4C74FF",
  infoSoft: "#8EA6FF",
  infoTint: "rgba(76, 116, 255, 0.14)",
  danger: "#FF6B6B",
  dangerTint: "rgba(255, 107, 107, 0.12)",
  warning: "#F4B860",

  overlay: "rgba(5, 6, 9, 0.66)",
  scrim: "rgba(14, 15, 19, 0.55)",
  /** Panneaux posés sur la carte, barre d'onglets, en-têtes collants. */
  panel: "rgba(21, 23, 29, 0.95)",
  tabBar: "rgba(18, 19, 24, 0.98)",
  headerBg: "rgba(14, 15, 19, 0.96)",
  sheetGold: "#17140E",
  gradAccent: ["#3A1F0E", "#15171D"] as [string, string],
  gradGold: ["#2B2416", "#16130C"] as [string, string],
  gradNeutral: ["#22252F", "#15171D"] as [string, string],
  gradCard: ["#1B1D25", "#15171D"] as [string, string],
  glowAccent: "rgba(255, 138, 61, 0.16)",
  glowGold: "rgba(233, 196, 106, 0.16)",
};

const LIGHT: typeof DARK = {
  bg: "#F6F4EF",
  bgElevated: "#FFFFFF",
  surface1: "#FFFFFF",
  surface2: "#F2EFE8",
  surface3: "#ECE8DF",
  surfaceHover: "#E7E2D8",
  border: "#E5E0D6",
  borderStrong: "#D8D2C6",
  borderHover: "#C6BFB1",

  text: "#17181C",
  textMuted: "#575A64",
  textSubtle: "#71747E",

  accent: "#F47A2A",
  accentPress: "#DE6A1C",
  onAccent: "#1A0F05",
  accentSoft: "#B9530E",
  accentTint: "rgba(244, 122, 42, 0.12)",
  accentTintStrong: "rgba(244, 122, 42, 0.2)",
  accentBorder: "rgba(244, 122, 42, 0.38)",

  gold: "#B98510",
  goldBg: "#FBF2DC",
  goldBorder: "#E8D29C",
  goldTint: "rgba(185, 133, 16, 0.12)",
  onGold: "#FFFFFF",

  success: "#1E8F58",
  successTint: "rgba(30, 143, 88, 0.12)",
  info: "#3458DB",
  infoSoft: "#3458DB",
  infoTint: "rgba(52, 88, 219, 0.10)",
  danger: "#CF3B3B",
  dangerTint: "rgba(207, 59, 59, 0.10)",
  warning: "#A86A12",

  overlay: "rgba(20, 20, 26, 0.45)",
  scrim: "rgba(246, 244, 239, 0.6)",
  panel: "rgba(255, 255, 255, 0.97)",
  tabBar: "rgba(255, 255, 255, 0.98)",
  headerBg: "rgba(246, 244, 239, 0.97)",
  sheetGold: "#FFF8E6",
  gradAccent: ["#FFE7D4", "#FFFFFF"],
  gradGold: ["#FBEFD0", "#FFFFFF"],
  gradNeutral: ["#FFFFFF", "#F2EFE8"],
  gradCard: ["#FFFFFF", "#F6F4EF"],
  glowAccent: "rgba(244, 122, 42, 0.14)",
  glowGold: "rgba(185, 133, 16, 0.12)",
};

export type ThemeMode = "dark" | "light";
export type Palette = typeof DARK;
export const PALETTES: Record<ThemeMode, Palette> = { dark: DARK, light: LIGHT };

/** Palette active (modifiée par applyTheme). */
export const colors: Palette = { ...DARK };
let currentMode: ThemeMode = "dark";
let version = 0;

export function themeMode(): ThemeMode {
  return currentMode;
}

/** Change la palette active ; l'app doit ensuite être remontée (voir ThemeContext). */
export function applyTheme(mode: ThemeMode): void {
  if (mode === currentMode) return;
  currentMode = mode;
  Object.assign(colors, PALETTES[mode]);
  shadow.accent.shadowColor = colors.accent;
  shadow.md.shadowOpacity = mode === "dark" ? 0.45 : 0.12;
  version++;
}

/**
 * Feuille de styles qui suit le thème : `const s = themed(() => StyleSheet.create({ box: { backgroundColor: colors.bg } }))`.
 * Les styles sont recalculés à la première lecture après un changement de thème.
 */
export function themed<T extends Record<string, object>>(make: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;
  const get = () => {
    if (!cache || builtFor !== version) {
      cache = make();
      builtFor = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, prop) => get()[prop as keyof T],
    has: (_t, prop) => prop in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, prop) => ({ ...Reflect.getOwnPropertyDescriptor(get(), prop), configurable: true }),
  });
}

/** Échelle 8 pt (demi-pas 4). */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 40, 8: 48, 9: 64 } as const;
export const GUTTER = 20;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const fonts = {
  display: "BricolageGrotesque_700Bold",
  displayHeavy: "BricolageGrotesque_800ExtraBold",
  displayMedium: "BricolageGrotesque_600SemiBold",
  body: "Manrope_500Medium",
  bodyRegular: "Manrope_400Regular",
  bodySemi: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
  bodyHeavy: "Manrope_800ExtraBold",
} as const;

export const type = {
  hero: { fontFamily: fonts.displayHeavy, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, letterSpacing: -0.2 },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 17 },
  caption: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow: {
  md: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
  accent: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
} = {
  md: {
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  accent: {
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
