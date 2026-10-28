import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from "react-native";
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { PlaceRow } from "@/components/PlaceCard";
import { UpsellCard } from "@/components/Premium";
import { Button, Chip, Pill, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { ChatTurn, ConciergeResponse, PlaceCard } from "@/lib/types";
import { colors, fonts, GUTTER, radius, space } from "@/theme/tokens";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  places?: PlaceCard[];
  kind?: "error" | "quota";
};

const SUGGESTIONS = [
  "Un rooftop calme ce soir pour un date",
  "Où manger un bon garba pas cher à Cocody ?",
  "Une sortie en famille ce week-end en plein air",
  "Un lounge festif entre amis, 20 000 FCFA max",
];

function Dot({ delay }: { delay: number }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.set(withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.3, { duration: 380 })), -1)));
  }, [o, delay]);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * 2 }] }));
  return <Animated.View style={[s.dot, a]} />;
}

function Typing() {
  return (
    <Animated.View entering={FadeInUp.duration(200)} style={[s.bubble, s.botBubble, { flexDirection: "row", gap: 5, paddingVertical: 16 }]} accessibilityLabel="Le concierge écrit">
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </Animated.View>
  );
}

export default function Concierge() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const { user } = useAuth();
  const { catName } = useMeta();
  const { apiOrigin } = useSettings();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Pick<ConciergeResponse, "provider" | "quota" | "retrieval"> | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const handledQ = useRef<string | null>(null);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    const history: ChatTurn[] = msgs.filter((m) => !m.kind).map((m) => ({ role: m.role, content: m.content })).slice(-6);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message }]);
    setText("");
    setBusy(true);
    try {
      const res = await api.concierge(message, apiOrigin, history);
      setMeta({ provider: res.provider, quota: res.quota, retrieval: res.retrieval });
      setMsgs((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: res.reply, places: res.places }]);
    } catch (e) {
      const quota = e instanceof ApiError && (e.kind === "quota" || e.kind === "rate_limited");
      if (e instanceof ApiError && e.kind === "auth") router.push("/login");
      setMsgs((m) => [...m, { id: `e${Date.now()}`, role: "assistant", content: errorMessage(e), kind: quota ? "quota" : "error" }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (user && params.q && handledQ.current !== params.q) {
      handledQ.current = params.q;
      void send(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, user]);

  // ----- Non connecté : invitation
  if (!user) {
    return (
      <View style={[s.screen, { paddingTop: insets.top + space[4] }]}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space[4], paddingBottom: space[7] }}>
          <LinearGradient colors={["#3A1F0E", "#15171D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.loginCard}>
            <View style={s.botAvatarLg}>
              <Icon name="sparkles" size={28} color={colors.onAccent} />
            </View>
            <Txt variant="h1">Ton concierge</Txt>
            <Txt variant="body" color={colors.textMuted}>
              Décris ta sortie idéale en une phrase. Le concierge te répond avec de vrais lieux de la base — jamais inventés.
            </Txt>
            <View style={{ gap: 10, marginTop: space[2] }}>
              <Button label="Se connecter" icon="user" onPress={() => router.push("/login")} />
              <Button label="Créer un compte" variant="secondary" onPress={() => router.push("/register")} />
            </View>
          </LinearGradient>
          <Txt variant="overline" color={colors.textSubtle}>
            EXEMPLES DE DEMANDES
          </Txt>
          {SUGGESTIONS.map((q) => (
            <View key={q} style={s.example}>
              <Icon name="sparkles" size={15} color={colors.accentSoft} />
              <Txt variant="bodySm" color={colors.textMuted} style={{ flex: 1 }}>
                {q}
              </Txt>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  const quotaReached = meta ? meta.quota.used >= meta.quota.limit : false;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[s.header, { paddingTop: insets.top + space[2] }]}>
        <View style={s.botAvatar}>
          <Icon name="sparkles" size={20} color={colors.onAccent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="h3">Concierge</Txt>
          <Txt variant="caption" color={colors.textMuted}>
            {meta ? `${meta.quota.used}/${meta.quota.limit} demandes aujourd'hui` : "Réponses basées sur les lieux de la base"}
          </Txt>
        </View>
        {meta ? (
          <Pill
            label={meta.provider === "anthropic" ? "IA" : "Mode règles"}
            tone={meta.provider === "anthropic" ? "accent" : "info"}
            icon={meta.provider === "anthropic" ? "sparkles" : "settings"}
          />
        ) : null}
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: GUTTER, gap: space[3], flexGrow: 1 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {!msgs.length ? (
          <Animated.View entering={FadeInDown.duration(400)} style={{ gap: space[4], flex: 1, justifyContent: "flex-end" }}>
            <View style={{ gap: space[2] }}>
              <Txt variant="h2">Salut {user.display_name.split(/\s|\(/)[0]}, on sort où ?</Txt>
              <Txt variant="body" color={colors.textMuted}>
                Dis-moi l&apos;ambiance, le quartier, le budget… Je te propose des lieux réels et tu peux affiner ensuite.
              </Txt>
            </View>
            <View style={{ gap: 8 }}>
              {SUGGESTIONS.map((q) => (
                <PressableScale key={q} onPress={() => send(q)} accessibilityRole="button" accessibilityLabel={q} style={s.suggestion}>
                  <Txt variant="label" style={{ flex: 1 }}>
                    {q}
                  </Txt>
                  <Icon name="arrowRight" size={16} color={colors.accent} />
                </PressableScale>
              ))}
            </View>
          </Animated.View>
        ) : null}

        {msgs.map((m) =>
          m.role === "user" ? (
            <Animated.View key={m.id} entering={FadeInUp.duration(220)} style={[s.bubble, s.userBubble]}>
              <Txt variant="body" color={colors.onAccent} style={{ fontFamily: fonts.bodySemi }}>
                {m.content}
              </Txt>
            </Animated.View>
          ) : (
            <Animated.View key={m.id} entering={FadeInUp.duration(260)} style={{ gap: 10 }}>
              <View style={[s.bubble, s.botBubble, m.kind ? { borderColor: m.kind === "quota" ? colors.goldBorder : "rgba(255,107,107,0.35)" } : null]}>
                <Txt variant="body" color={m.kind === "error" ? colors.danger : colors.text}>
                  {m.content}
                </Txt>
              </View>
              {m.kind === "quota" ? (
                <UpsellCard title="Plus de demandes ?" body="Les offres Plus et Insider augmentent ton quota quotidien de concierge." />
              ) : null}
              {m.places?.map((p) => (
                <PlaceRow key={p.id} p={p} catName={catName} showReasons />
              ))}
            </Animated.View>
          ),
        )}
        {busy ? <Typing /> : null}
        {msgs.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {["Moins cher", "Plus calme", "Ouvert maintenant"].map((r) => (
              <Chip key={r} size="sm" label={r} onPress={() => send(r)} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={s.inputBar}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={quotaReached ? "Quota du jour atteint" : "Écris ta demande…"}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          style={s.input}
          multiline
          numberOfLines={Platform.OS === "web" ? 1 : undefined}
          maxLength={500}
          accessibilityLabel="Message au concierge"
          editable={!quotaReached}
          onSubmitEditing={() => send(text)}
          submitBehavior="submit"
          returnKeyType="send"
          maxFontSizeMultiplier={1.3}
        />
        <PressableScale
          onPress={() => send(text)}
          disabled={!text.trim() || busy || quotaReached}
          accessibilityRole="button"
          accessibilityLabel="Envoyer"
          haptic
          style={[s.send, !text.trim() || busy ? { backgroundColor: colors.surface3 } : null]}
        >
          <Icon name="send" size={19} color={!text.trim() || busy ? colors.textSubtle : colors.onAccent} />
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingBottom: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  botAvatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  botAvatarLg: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  loginCard: { borderRadius: radius.xl, padding: space[5], gap: space[2], borderWidth: 1, borderColor: "rgba(255,138,61,0.25)" },
  example: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: radius.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong },
  bubble: { maxWidth: "86%", paddingHorizontal: 15, paddingVertical: 11, borderRadius: 20 },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  botBubble: { alignSelf: "flex-start", backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textMuted },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: GUTTER,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 23,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15.5,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
