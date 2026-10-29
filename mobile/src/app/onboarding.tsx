import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice } from "@/components/feedback";
import { Icon, type IconName } from "@/components/Icon";
import { LocationPicker } from "@/components/LocationPicker";
import { PrefsEditor } from "@/components/PrefsEditor";
import { Button, hapticSuccess, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { APP_NAME } from "@/lib/config";
import { colors, GUTTER, radius, space } from "@/theme/tokens";

const SLIDES: { overline: string; title: string; body: string; icon: IconName; orbit: IconName[]; gold?: boolean }[] = [
  {
    overline: "Bienvenue",
    title: "Où sort-on ce soir ?",
    body: "Maquis, rooftops, plages, lounges, culture… Les bonnes adresses d'Abidjan, triées pour toi.",
    icon: "compass",
    orbit: ["flame", "building", "waves", "music"],
  },
  {
    overline: "Pépites",
    title: "Des lieux rares, pas des pubs",
    body: "Une sélection de curateurs, des adresses cachées réservées aux membres Insider.",
    icon: "gem",
    orbit: ["crown", "sparkles", "glass", "palette"],
    gold: true,
  },
  {
    overline: "Honnête",
    title: "Ton concierge dit la vérité",
    body: "Distances à vol d'oiseau, horaires non vérifiés signalés comme tels, aucun avis inventé.",
    icon: "sparkles",
    orbit: ["shield", "clock", "pin", "route"],
  },
];

function Art({ icon, orbit, gold }: { icon: IconName; orbit: IconName[]; gold?: boolean }) {
  const tint = gold ? colors.gold : colors.accent;
  const pos = [
    { top: 6, left: 18 },
    { top: 30, right: 10 },
    { bottom: 18, left: 0 },
    { bottom: 0, right: 34 },
  ];
  return (
    <Animated.View entering={FadeIn.duration(500)} style={s.art}>
      <View style={[s.ring, { borderColor: gold ? colors.goldBorder : "rgba(255,138,61,0.22)", width: 250, height: 250, borderRadius: 125 }]} />
      <View style={[s.ring, { borderColor: colors.border, width: 180, height: 180, borderRadius: 90 }]} />
      <LinearGradient
        colors={gold ? ["#4A3D20", "#1A150B"] : ["#FF8A3D", "#7A3510"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.core}
      >
        <Icon name={icon} size={52} color={gold ? colors.gold : colors.onAccent} strokeWidth={1.7} />
      </LinearGradient>
      {orbit.map((o, i) => (
        <Animated.View key={o} entering={FadeInDown.delay(120 + i * 90).duration(420)} style={[s.orb, pos[i]]}>
          <Icon name={o} size={22} color={tint} />
        </Animated.View>
      ))}
    </Animated.View>
  );
}

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { prefs, savePrefs, completeOnboarding } = useSettings();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const total = SLIDES.length + 2;

  const finish = async () => {
    setSaving(true);
    try {
      await savePrefs(draft);
    } catch {
      // Préférences gardées localement ; synchronisées à la prochaine connexion.
    }
    hapticSuccess();
    await completeOnboarding();
    setSaving(false);
    router.replace("/");
  };

  const next = () => setStep((s0) => Math.min(total - 1, s0 + 1));
  const slide = SLIDES[step];

  return (
    <View style={[s.screen, { paddingTop: insets.top + space[3] }]}>
      <View style={s.top}>
        <Txt variant="h3" color={colors.accent} style={{ letterSpacing: -0.3 }}>
          {APP_NAME}
        </Txt>
        <View style={s.dots} accessibilityLabel={`Étape ${step + 1} sur ${total}`}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={[s.dot, i === step ? s.dotOn : null, i < step ? { backgroundColor: colors.accentSoft } : null]} />
          ))}
        </View>
        {step < SLIDES.length ? (
          <PressableScale onPress={() => setStep(SLIDES.length)} accessibilityRole="button" accessibilityLabel="Passer l'introduction" hitSlop={10}>
            <Txt variant="label" color={colors.textMuted}>
              Passer
            </Txt>
          </PressableScale>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {slide ? (
        <View style={{ flex: 1 }} key={`slide-${step}`}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Art icon={slide.icon} orbit={slide.orbit} gold={slide.gold} />
          </View>
          <Animated.View entering={FadeInRight.duration(380)} style={{ paddingHorizontal: GUTTER, gap: space[3], paddingBottom: space[5] }}>
            <Txt variant="overline" color={slide.gold ? colors.gold : colors.accentSoft}>
              {slide.overline.toUpperCase()}
            </Txt>
            <Txt variant="hero">{slide.title}</Txt>
            <Txt variant="body" color={colors.textMuted} style={{ fontSize: 16, lineHeight: 24 }}>
              {slide.body}
            </Txt>
          </Animated.View>
        </View>
      ) : step === SLIDES.length ? (
        <ScrollView key="prefs" contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: space[5], gap: space[5] }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInRight.duration(350)} style={{ gap: space[2], marginTop: space[4] }}>
            <Txt variant="h1">Tes envies</Txt>
            <Txt variant="body" color={colors.textMuted}>
              Choisis ce qui te ressemble. Tout se modifie plus tard dans « Moi ».
            </Txt>
          </Animated.View>
          <PrefsEditor value={draft} onChange={setDraft} />
        </ScrollView>
      ) : (
        <ScrollView key="loc" contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: space[5], gap: space[5] }} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInRight.duration(350)} style={{ gap: space[3], marginTop: space[4] }}>
            <View style={s.locBadge}>
              <Icon name="pin" size={26} color={colors.accent} />
            </View>
            <Txt variant="h1">Où es-tu ?</Txt>
            <Txt variant="body" color={colors.textMuted}>
              Avec ta permission, ta position sert uniquement à calculer la distance à vol d&apos;oiseau jusqu&apos;aux lieux. Elle n&apos;est ni
              partagée ni conservée. Tu peux aussi simplement choisir un quartier.
            </Txt>
          </Animated.View>
          <LocationPicker />
          {!user ? <Notice icon="info">Tes préférences restent sur ce téléphone. Connecte-toi plus tard pour les retrouver partout.</Notice> : null}
        </ScrollView>
      )}

      <View style={[s.footer, { paddingBottom: insets.bottom + space[3] }]}>
        {step > 0 ? (
          <Button label="Retour" variant="ghost" onPress={() => setStep(step - 1)} full={false} style={{ width: 110 }} />
        ) : null}
        <Button
          label={step === total - 1 ? "C'est parti" : step === SLIDES.length ? "Continuer" : "Suivant"}
          icon={step === total - 1 ? "check" : "arrowRight"}
          onPress={step === total - 1 ? finish : next}
          loading={saving}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: GUTTER, height: 44 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderHover },
  dotOn: { width: 22, backgroundColor: colors.accent },
  art: { width: 280, height: 280, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 1 },
  core: { width: 112, height: 112, borderRadius: 36, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
  orb: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  locBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { flexDirection: "row", gap: space[3], paddingHorizontal: GUTTER, paddingTop: space[3] },
});
