import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState, Notice } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { CheckoutUnavailableSheet } from "@/components/Premium";
import { ScreenHeader } from "@/components/Screen";
import { Button, hapticLight, Pill, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { api, ApiError, errorMessage } from "@/lib/api";
import { formatFcfa, PLAN_LABELS } from "@/lib/format";
import type { BillingPlan, Plan } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, radius, space } from "@/theme/tokens";

const RANK: Record<Plan, number> = { free: 0, plus: 1, insider: 2 };

function priceText(p: BillingPlan): string {
  if (p.price_fcfa === 0) return "Gratuit";
  if (p.price_fcfa == null) return "Prix bientôt annoncé";
  return `${formatFcfa(p.price_fcfa)} / mois`;
}

export default function Premium() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const plans = useAsync(() => api.billing.plans(), []);
  const sub = useAsync(() => api.me.subscription(), [user?.id], !!user);
  const [checkout, setCheckout] = useState<{ plan: Plan; loading: boolean } | null>(null);
  const [sheet, setSheet] = useState<string | null | false>(false);
  const [error, setError] = useState<string | null>(null);
  const current: Plan = user?.plan ?? "free";

  const choose = async (plan: Plan) => {
    if (!user) {
      router.push("/login");
      return;
    }
    hapticLight();
    setError(null);
    setCheckout({ plan, loading: true });
    try {
      const res = (await api.billing.checkout(plan)) as { url?: unknown } | undefined;
      // Contrat : 501 tant qu'aucun agrégateur n'est branché. Si un jour une URL de paiement est renvoyée, on l'ouvre.
      if (res && typeof res.url === "string") await Linking.openURL(res.url);
      else setError("Le paiement n'a pas pu démarrer.");
    } catch (e) {
      if (e instanceof ApiError && e.kind === "not_configured") setSheet(e.detail);
      else setError(errorMessage(e));
    } finally {
      setCheckout(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={["rgba(233,196,106,0.14)", "rgba(233,196,106,0)"]} style={s.glow} pointerEvents="none" />
      <ScreenHeader title="Offres" close transparent />
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: space[4] }}>
        <View style={{ gap: 6 }}>
          <Txt variant="overline" color={colors.gold}>
            PREMIUM
          </Txt>
          <Txt variant="h1">Sors mieux, plus souvent</Txt>
          <Txt variant="body" color={colors.textMuted}>
            Pépites cachées, concierge illimité ou presque, soirées plus longues.
          </Txt>
          {user && sub.data ? (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
              <Pill label={`Offre actuelle : ${PLAN_LABELS[sub.data.plan] ?? sub.data.plan}`} tone={sub.data.plan === "free" ? "neutral" : "gold"} icon="crown" />
            </View>
          ) : null}
        </View>

        {plans.error ? <ErrorState error={plans.error} onRetry={plans.reload} /> : null}
        {plans.loading ? <ActivityIndicator color={colors.gold} style={{ marginTop: space[5] }} /> : null}

        {plans.data?.map((p, i) => {
          const isCurrent = p.code === current;
          const higher = RANK[p.code] > RANK[current];
          const featured = p.code === "insider";
          return (
            <Animated.View key={p.code} entering={FadeInDown.delay(i * 80).duration(380)}>
              <LinearGradient
                colors={featured ? ["#2B2416", "#16130C"] : ["#1B1D25", "#15171D"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.plan, featured ? { borderColor: colors.gold } : null, isCurrent ? { borderColor: colors.accent } : null]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Txt variant="h2" color={featured ? colors.gold : colors.text} style={{ flex: 1 }}>
                    {p.name}
                  </Txt>
                  {isCurrent ? <Pill label="Ton offre" tone="accent" icon="check" /> : featured ? <Pill label="Pépites" tone="gold" icon="gem" /> : null}
                </View>
                <Txt variant="title" color={colors.textMuted}>
                  {priceText(p)}
                </Txt>
                <View style={{ gap: 8, marginTop: 4 }}>
                  {p.features.map((f) => (
                    <View key={f} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                      <Icon name="check" size={16} color={featured ? colors.gold : colors.success} strokeWidth={2.4} />
                      <Txt variant="bodySm" style={{ flex: 1 }}>
                        {f}
                      </Txt>
                    </View>
                  ))}
                </View>
                <Txt variant="caption" color={colors.textSubtle}>
                  Concierge : {p.quotas.concierge_per_day}/jour · Soirées : {p.quotas.itinerary_max_steps} étapes max
                </Txt>
                {higher ? (
                  <Button
                    label={`Passer à ${p.name}`}
                    variant={featured ? "gold" : "primary"}
                    onPress={() => choose(p.code)}
                    loading={checkout?.plan === p.code && checkout.loading}
                    style={{ marginTop: space[2] }}
                  />
                ) : null}
              </LinearGradient>
            </Animated.View>
          );
        })}

        {error ? <Notice icon="info">{error}</Notice> : null}
        <Notice icon="smartphone">Paiement prévu par Mobile Money (Orange Money, Wave, MTN MoMo). Il n&apos;est pas encore activé : aucun débit n&apos;est possible pour l&apos;instant.</Notice>
      </ScrollView>
      <CheckoutUnavailableSheet visible={sheet !== false} onClose={() => setSheet(false)} detail={sheet || null} />
    </View>
  );
}

const s = StyleSheet.create({
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
  plan: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong, padding: space[4], gap: space[2] },
});
