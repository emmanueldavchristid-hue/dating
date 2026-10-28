/** Design system — « concierge » sombre premium (miroir de web/src/styles/tokens.css). */
export const colors = {
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

  gold: "#E9C46A",
  goldBg: "#2B2416",
  goldBorder: "#4A3D20",

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
} as const;

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

export const shadow = {
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
} as const;
