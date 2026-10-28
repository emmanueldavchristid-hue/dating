import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSettings } from "@/context/SettingsContext";
import { useMeta } from "@/context/MetaContext";
import { colors, radius, space } from "@/theme/tokens";
import { Notice } from "./feedback";
import { Icon } from "./Icon";
import { Chip, PressableScale, Txt } from "./ui";

/** Choix de l'origine : position (consentement explicite) ou ville + quartier. */
export function LocationPicker({ onDone, showGps = true }: { onDone?: () => void; showGps?: boolean }) {
  const { cities } = useMeta();
  const { choice, enableGps, setCity, gpsState } = useSettings();
  const [busy, setBusy] = useState(false);
  const currentCity = choice.kind === "city" ? choice.city : cities[0]?.slug ?? "abidjan";
  const [city, setCityLocal] = useState(currentCity);
  const district = choice.kind === "city" && choice.city === city ? choice.district : null;
  const cityObj = cities.find((c) => c.slug === city);

  return (
    <View style={{ gap: space[4] }}>
      {showGps ? (
        <PressableScale
          onPress={async () => {
            setBusy(true);
            const ok = await enableGps();
            setBusy(false);
            if (ok) onDone?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Utiliser ma position"
          style={[s.gps, choice.kind === "gps" ? { borderColor: colors.accent, backgroundColor: colors.accentTint } : null]}
        >
          <View style={s.gpsIcon}>
            {busy ? <ActivityIndicator color={colors.accent} /> : <Icon name="locate" size={20} color={colors.accent} />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="title">Utiliser ma position</Txt>
            <Txt variant="caption" color={colors.textMuted}>
              Pour trier par distance à vol d&apos;oiseau. Jamais partagée.
            </Txt>
          </View>
          {choice.kind === "gps" ? <Icon name="check" size={20} color={colors.accent} /> : null}
        </PressableScale>
      ) : null}
      {gpsState === "denied" ? (
        <Notice icon="info">Localisation refusée. Choisis plutôt une ville et un quartier — tu pourras changer d&apos;avis dans les réglages du téléphone.</Notice>
      ) : null}

      <View style={{ gap: space[2] }}>
        <Txt variant="overline" color={colors.textSubtle}>
          VILLE
        </Txt>
        <View style={s.wrap}>
          {cities.map((c) => (
            <Chip
              key={c.slug}
              label={c.name}
              selected={city === c.slug && choice.kind === "city"}
              onPress={() => {
                setCityLocal(c.slug);
                void setCity(c.slug, null);
              }}
            />
          ))}
        </View>
      </View>
      {cityObj && cityObj.districts.length ? (
        <View style={{ gap: space[2] }}>
          <Txt variant="overline" color={colors.textSubtle}>
            QUARTIER (FACULTATIF)
          </Txt>
          <View style={s.wrap}>
            <Chip label="Toute la ville" size="sm" selected={choice.kind === "city" && choice.city === city && !district} onPress={() => setCity(city, null)} />
            {cityObj.districts.map((d) => (
              <Chip
                key={d.slug}
                size="sm"
                label={d.name}
                selected={choice.kind === "city" && district === d.slug}
                onPress={() => {
                  void setCity(city, d.slug);
                  onDone?.();
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gps: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  gpsIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
});
