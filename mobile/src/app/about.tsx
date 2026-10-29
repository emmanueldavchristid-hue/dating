import Constants from "expo-constants";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice } from "@/components/feedback";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenHeader } from "@/components/Screen";
import { Card, Txt } from "@/components/ui";
import { useMeta } from "@/context/MetaContext";
import { API_URL, APP_NAME, APP_TAGLINE } from "@/lib/config";
import { colors, GUTTER, radius, space } from "@/theme/tokens";

const PRINCIPLES: { icon: IconName; title: string; body: string }[] = [
  { icon: "pin", title: "Distances à vol d'oiseau", body: "Aucun temps de trajet n'est inventé : il n'apparaît que si un service d'itinéraire le calcule." },
  { icon: "clock", title: "Horaires honnêtes", body: "Quand les horaires ne sont pas vérifiés, on l'écrit. Appelle avant de te déplacer." },
  { icon: "star", title: "Avis réels uniquement", body: "Pas de note fabriquée : «\u00a0Pas encore d'avis\u00a0» tant qu'il n'y en a pas." },
  { icon: "shield", title: "Ta position reste à toi", body: "Utilisée seulement après ton accord, pour trier par distance. Jamais revendue." },
];

export default function About() {
  const insets = useSafeAreaInsets();
  const { capabilities } = useMeta();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={`À propos`} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: space[4] }}>
        <View style={{ alignItems: "center", gap: 8, paddingVertical: space[3] }}>
          <View style={s.logo}>
            <Icon name="compass" size={34} color={colors.onAccent} />
          </View>
          <Txt variant="h1">{APP_NAME}</Txt>
          <Txt variant="body" color={colors.textMuted}>
            {APP_TAGLINE}
          </Txt>
          <Txt variant="caption" color={colors.textSubtle}>
            Version {Constants.expoConfig?.version ?? "1.0.0"}
          </Txt>
        </View>

        {capabilities?.demo_data !== false ? (
          <Notice icon="info" tone="gold">
            Données de démonstration fictives : les lieux, avis, horaires et visuels actuels sont inventés pour illustrer l&apos;application. Les fiches portent un badge « Démo ».
          </Notice>
        ) : null}

        <Txt variant="h3">Nos principes</Txt>
        {PRINCIPLES.map((p) => (
          <View key={p.title} style={s.principle}>
            <View style={s.pIcon}>
              <Icon name={p.icon} size={18} color={colors.accentSoft} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title">{p.title}</Txt>
              <Txt variant="bodySm" color={colors.textMuted}>
                {p.body}
              </Txt>
            </View>
          </View>
        ))}

        <Txt variant="h3">Mentions & attributions</Txt>
        <Card style={{ gap: 10 }}>
          <Txt variant="bodySm" color={colors.textMuted}>
            Données cartographiques © contributeurs OpenStreetMap (licence ODbL), lorsque des lieux en proviennent.
          </Txt>
          <Txt variant="bodySm" color={colors.textMuted}>
            Fonds de carte de l&apos;application mobile : Apple Plans (iOS) ou Google Maps (Android).
          </Txt>
          <Txt variant="bodySm" color={colors.textMuted}>
            Polices Bricolage Grotesque et Manrope — SIL Open Font License.
          </Txt>
          <Txt variant="bodySm" color={colors.textMuted}>
            Paiement Mobile Money (Orange Money, Wave, MTN MoMo) : pas encore activé.
          </Txt>
          <Txt variant="caption" color={colors.textSubtle}>
            Serveur : {API_URL} · IA : {capabilities?.ai === "anthropic" ? "activée" : "mode règles"} · Itinéraires : {capabilities?.routing === "osrm" ? "OSRM" : "non configurés"}
          </Txt>
        </Card>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  logo: { width: 72, height: 72, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }], marginBottom: 6 },
  principle: { flexDirection: "row", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  pIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
});
