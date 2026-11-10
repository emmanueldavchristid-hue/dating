import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, themed } from "@/theme/tokens";
import { Txt } from "./ui";
import { Icon, type IconName } from "./Icon";

const FALLBACK: [string, string] = ["#232634", "#0E0F13"];

function safeGradient(g: unknown): [string, string] {
  if (Array.isArray(g) && g.length >= 2 && typeof g[0] === "string" && typeof g[1] === "string") return [g[0], g[1]];
  return FALLBACK;
}

/**
 * Visuel d'un lieu : photo si `url`, sinon couverture générée à partir du dégradé
 * fourni par l'API et d'un grand glyphe de catégorie (jamais de fausse photo).
 */
export function Cover({
  url,
  gradient,
  alt,
  glyph,
  glyphSize = 120,
  locked,
  style,
  children,
  shade = true,
  centered,
  credit,
  kind,
  hideBadge,
}: {
  url: string | null | undefined;
  gradient: unknown;
  alt: string;
  glyph: IconName;
  glyphSize?: number;
  locked?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  shade?: boolean;
  /** Glyphe centré (petites vignettes) plutôt que débordant en bas à droite. */
  centered?: boolean;
  /** Crédit court affiché sur l'image (auteur · licence, « Google Maps »…). */
  credit?: string | null;
  /** « illustration » : visuel de l'app, signalé comme tel (jamais présenté comme une photo du lieu). */
  kind?: string | null;
  /** Masque le badge « Illustration » (vignettes trop petites). */
  hideBadge?: boolean;
}) {
  const [a, b] = locked ? (["#3A2F17", "#14110A"] as [string, string]) : safeGradient(gradient);
  // Image injoignable (réseau, lien mort) : on retombe sur la couverture générée plutôt qu'un aplat vide.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!url && !locked && failedUrl !== url;
  return (
    <View style={[s.wrap, style]} accessible accessibilityRole="image" accessibilityLabel={alt}>
      <LinearGradient colors={[a, b]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      {showImage ? (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={250}
          accessibilityIgnoresInvertColors
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <>
          {/* Halo lumineux + glyphe de catégorie */}
          <LinearGradient
            colors={["rgba(255,255,255,0.10)", "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 0.7 }}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={centered ? [StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }] : [s.glyph, { right: -glyphSize * 0.12, bottom: -glyphSize * 0.1 }]}
            pointerEvents="none"
          >
            <Icon
              name={locked ? "lock" : glyph}
              size={glyphSize}
              color={locked ? (centered ? colors.gold : "rgba(233,196,106,0.30)") : "rgba(244,241,234,0.13)"}
              strokeWidth={centered ? 1.8 : 1.3}
            />
          </View>
        </>
      )}
      {shade ? (
        <LinearGradient
          colors={["rgba(14,15,19,0)", "rgba(14,15,19,0.0)", "rgba(14,15,19,0.55)"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
      {showImage && credit ? (
        <View style={s.credit} pointerEvents="none">
          <Txt variant="caption" color="rgba(244,241,234,0.85)" style={{ fontSize: 10 }}>
            {credit}
          </Txt>
        </View>
      ) : null}
      {!showImage && !locked && kind === "illustration" && !hideBadge ? (
        <View style={s.badge} pointerEvents="none" testID="illustration-badge" accessibilityLabel="Illustration, pas une photo du lieu">
          <Txt variant="caption" color="rgba(244,241,234,0.9)" style={{ fontSize: 10, letterSpacing: 0.3 }}>
            Illustration
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  credit: { position: "absolute", left: 6, bottom: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: "rgba(14,15,19,0.55)" },
  badge: { position: "absolute", right: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "rgba(14,15,19,0.55)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(244,241,234,0.25)" },
  wrap: { overflow: "hidden", backgroundColor: colors.surface2 },
  glyph: { position: "absolute" },
}));
