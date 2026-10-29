import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { colors, radius, space } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Button, Txt } from "./ui";

/** Encart d'incitation premium (or). */
export function UpsellCard({ title, body, cta = "Découvrir les offres" }: { title: string; body: string; cta?: string }) {
  return (
    <LinearGradient colors={["#2B2416", "#15120B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.card}>
      <View style={s.icon}>
        <Icon name="crown" size={22} color={colors.gold} />
      </View>
      <Txt variant="h3" color={colors.gold}>
        {title}
      </Txt>
      <Txt variant="bodySm" color={colors.textMuted}>
        {body}
      </Txt>
      <Button label={cta} variant="gold" icon="gem" onPress={() => router.push("/premium")} haptic style={{ marginTop: space[2] }} />
    </LinearGradient>
  );
}

/** Paiement non configuré (501) : on le dit, sans simuler de paiement. */
export function CheckoutUnavailableSheet({ visible, onClose, detail }: { visible: boolean; onClose: () => void; detail?: string | null }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Paiement pas encore activé" tone="gold" footer={<Button label="Compris" variant="gold" onPress={onClose} style={{ flex: 1 }} />}>
      <Txt variant="body" color={colors.textMuted}>
        {detail || "Le paiement mobile n'est pas encore branché."} Aucun montant n&apos;a été débité.
      </Txt>
      <View style={{ gap: 10 }}>
        {["Orange Money", "Wave", "MTN MoMo"].map((m) => (
          <View key={m} style={s.method}>
            <Icon name="smartphone" size={18} color={colors.gold} />
            <Txt variant="title" style={{ flex: 1 }}>
              {m}
            </Txt>
            <Txt variant="caption" color={colors.gold}>
              Bientôt
            </Txt>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.goldBorder, padding: space[4], gap: space[2] },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(233,196,106,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  method: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: "rgba(233,196,106,0.06)", borderWidth: 1, borderColor: colors.goldBorder },
});
