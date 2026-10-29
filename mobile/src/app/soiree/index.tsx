import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, Notice, useToast } from "@/components/feedback";
import { categoryIcon, Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/Screen";
import { Timeline, type TimelineStep } from "@/components/Timeline";
import { Button, Card, Chip, Field, hapticSuccess, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api, ApiError, errorMessage, stepCount } from "@/lib/api";
import { track } from "@/lib/events";
import { BUDGET_PRESETS, toggleIn } from "@/lib/filters";
import { formatDate } from "@/lib/format";
import { moveItem, relegs, totalBudget } from "@/lib/itinerary";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, radius, space } from "@/theme/tokens";

export default function Soiree() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { categories, catName, plans } = useMeta();
  const { apiOrigin } = useSettings();
  const maxSteps = plans.find((p) => p.code === (user?.plan ?? "free"))?.quotas.itinerary_max_steps ?? 2;
  const [nSteps, setNSteps] = useState(2);
  const [cats, setCats] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [steps, setSteps] = useState<TimelineStep[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = useAsync(() => api.itineraries.list(), [user?.id], !!user);

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Ma soirée" />
        <EmptyState icon="route" title="Compose ta soirée" body="Connecte-toi pour que le concierge enchaîne les étapes de ta sortie et pour les enregistrer." action={{ label: "Se connecter", onPress: () => router.push("/login") }} />
      </View>
    );
  }

  const suggest = async () => {
    setLoading(true);
    setError(null);
    setUpsell(false);
    try {
      const res = await api.itineraries.suggest({ ...apiOrigin, steps: nSteps, categories: cats.length ? cats : undefined, budget_max_fcfa: budget ?? undefined });
      setSteps(res.steps.map((s0) => ({ place: s0.place, leg_km: s0.leg_km })));
      setNotes(res.notes);
      setTitle(`Ma soirée du ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" }).format(new Date())}`);
      if (!res.steps.length) setError("Aucune combinaison trouvée avec ces critères. Élargis le budget ou les catégories.");
    } catch (e) {
      if (e instanceof ApiError && e.kind === "premium") setUpsell(true);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const move = (from: number, to: number) => {
    if (steps) setSteps(relegs(moveItem(steps, from, to)));
  };

  const save = async () => {
    if (!steps?.length) return;
    setSaving(true);
    try {
      const it = await api.itineraries.create(title.trim() || "Ma soirée", steps.map((s0) => ({ place_id: s0.place.id })));
      steps.forEach((s0) => track("itinerary_add", s0.place.id));
      hapticSuccess();
      toast("Soirée enregistrée", "check");
      setSteps(null);
      saved.reload();
      if (it?.id) router.push({ pathname: "/soiree/[id]", params: { id: it.id } });
    } catch (e) {
      toast(errorMessage(e), "info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Ma soirée" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: space[5] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Txt variant="h1">On enchaîne ?</Txt>
          <Txt variant="body" color={colors.textMuted}>
            Choisis le nombre d&apos;étapes et tes envies : on te propose un parcours proche, à ajuster ensuite.
          </Txt>
        </View>

        <Card style={{ gap: space[4] }}>
          <View style={{ gap: space[2] }}>
            <Txt variant="overline" color={colors.textSubtle}>
              NOMBRE D&apos;ÉTAPES
            </Txt>
            <View style={s.steps}>
              {[2, 3, 4, 5].map((n) => {
                const locked = n > maxSteps;
                const on = nSteps === n;
                return (
                  <PressableScale
                    key={n}
                    onPress={() => (locked ? setUpsell(true) : setNSteps(n))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={locked ? `${n} étapes, réservé aux offres premium` : `${n} étapes`}
                    style={[s.stepBtn, on ? s.stepOn : null, locked ? s.stepLocked : null]}
                  >
                    <Txt variant="h3" color={on ? colors.onAccent : locked ? colors.gold : colors.text}>
                      {n}
                    </Txt>
                    {locked ? <Icon name="lock" size={12} color={colors.gold} /> : null}
                  </PressableScale>
                );
              })}
            </View>
            {upsell ? (
              <View style={s.inlineUpsell}>
                <Icon name="crown" size={18} color={colors.gold} />
                <Txt variant="bodySm" color={colors.gold} style={{ flex: 1 }}>
                  Ton offre permet {maxSteps} étapes. Plus : 4, Insider : 5.
                </Txt>
                <Button label="Offres" variant="gold" size="sm" full={false} onPress={() => router.push("/premium")} />
              </View>
            ) : (
              <Txt variant="caption" color={colors.textSubtle}>
                Ton offre permet {maxSteps} étapes.
              </Txt>
            )}
          </View>
          <View style={{ gap: space[2] }}>
            <Txt variant="overline" color={colors.textSubtle}>
              ENVIES (FACULTATIF)
            </Txt>
            <View style={s.wrap}>
              {categories.map((c) => (
                <Chip key={c.slug} size="sm" icon={categoryIcon(c.icon || c.slug)} label={c.name} selected={cats.includes(c.slug)} onPress={() => setCats(toggleIn(cats, c.slug))} />
              ))}
            </View>
          </View>
          <View style={{ gap: space[2] }}>
            <Txt variant="overline" color={colors.textSubtle}>
              BUDGET MAX (FCFA)
            </Txt>
            <View style={s.wrap}>
              <Chip size="sm" label="Sans limite" selected={budget == null} onPress={() => setBudget(null)} />
              {BUDGET_PRESETS.map((b) => (
                <Chip key={b.value} size="sm" label={b.label} selected={budget === b.value} onPress={() => setBudget(b.value)} />
              ))}
            </View>
          </View>
          <Button label={steps ? "Proposer une autre soirée" : "Proposer ma soirée"} icon="sparkles" onPress={suggest} loading={loading} />
        </Card>

        {error && !upsell ? <Notice icon="info">{error}</Notice> : null}

        {steps && steps.length ? (
          <Animated.View entering={FadeInDown.duration(380)} style={{ gap: space[4] }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <Txt variant="h2" style={{ flex: 1 }}>
                Ta proposition
              </Txt>
              <Txt variant="label" color={colors.accentSoft}>
                {totalBudget(steps) ?? "Budget incomplet"}
              </Txt>
            </View>
            <Timeline steps={steps} catName={catName} editable onMove={move} onRemove={(i) => setSteps(relegs(steps.filter((_, j) => j !== i)))} />
            {notes.length ? (
              <View style={{ gap: 8 }}>
                {notes.map((n) => (
                  <Notice key={n} icon="info">
                    {n}
                  </Notice>
                ))}
              </View>
            ) : null}
            <Field label="Nom de la soirée" value={title} onChangeText={setTitle} maxLength={120} />
            <Button label="Enregistrer cette soirée" icon="check" onPress={save} loading={saving} haptic />
          </Animated.View>
        ) : null}

        <View style={{ gap: space[3] }}>
          <Txt variant="h3">Mes soirées enregistrées</Txt>
          {saved.data && saved.data.length ? (
            saved.data.map((it) => (
              <PressableScale key={it.id} onPress={() => router.push({ pathname: "/soiree/[id]", params: { id: it.id } })} accessibilityRole="button" accessibilityLabel={it.title} style={s.saved}>
                <View style={s.savedIcon}>
                  <Icon name="route" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="title" numberOfLines={1}>
                    {it.title}
                  </Txt>
                  <Txt variant="caption" color={colors.textMuted}>
                    {[formatDate(it.date), `${stepCount(it)} étape${stepCount(it) > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
                  </Txt>
                </View>
                <Icon name="chevronRight" size={18} color={colors.textSubtle} />
              </PressableScale>
            ))
          ) : (
            <Txt variant="bodySm" color={colors.textMuted}>
              {saved.loading ? "Chargement…" : saved.error ? errorMessage(saved.error) : "Aucune soirée enregistrée pour l'instant."}
            </Txt>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  steps: { flexDirection: "row", gap: 10 },
  stepBtn: { flex: 1, height: 54, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  stepOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepLocked: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  inlineUpsell: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, paddingLeft: 12, borderRadius: radius.md, backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder },
  saved: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  savedIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
});
