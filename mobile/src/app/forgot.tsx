import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice, useToast } from "@/components/feedback";
import { ScreenHeader } from "@/components/Screen";
import { Button, Field, hapticSuccess, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import { colors, GUTTER, space } from "@/theme/tokens";

/** Mot de passe oublié : un code à 6 chiffres par e-mail, puis un nouveau mot de passe (connexion directe). */
export default function Forgot() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();
  const { resetPassword } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState(params.email ?? "");
  const [step, setStep] = useState<"email" | "code">("email");
  const [delivery, setDelivery] = useState<"email" | "none">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailOk = /\S+@\S+\.\S+/.test(email.trim());

  const send = async () => {
    if (!emailOk) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.auth.forgot(email.trim());
      setDelivery(r.delivery);
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!/^\d{6}$/.test(code.trim()) || password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email, code, password);
      hapticSuccess();
      toast("Mot de passe changé, tu es connecté", "check");
      router.dismissAll?.();
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Mot de passe oublié" />
      <ScrollView contentContainerStyle={{ padding: GUTTER, gap: space[4], paddingBottom: insets.bottom + space[5] }} keyboardShouldPersistTaps="handled">
        {step === "email" ? (
          <>
            <View style={{ gap: 6 }}>
              <Txt variant="h2">Pas de souci</Txt>
              <Txt variant="body" color={colors.textMuted}>
                Entre l&apos;e-mail de ton compte : on t&apos;envoie un code à 6 chiffres pour choisir un nouveau mot de passe.
              </Txt>
            </View>
            <Field label="E-mail" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="toi@exemple.com" onSubmitEditing={send} returnKeyType="send" />
            {error ? <Notice icon="info">{error}</Notice> : null}
            <Button label="Recevoir un code" icon="mail" onPress={send} loading={busy} disabled={!emailOk} />
          </>
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Txt variant="h2">Vérifie tes e-mails</Txt>
              <Txt variant="body" color={colors.textMuted}>
                Si un compte existe pour {email.trim()}, un code vient d&apos;y être envoyé. Il est valable 15 minutes.
              </Txt>
            </View>
            {delivery === "none" ? (
              <Notice icon="info">
                L&apos;envoi d&apos;e-mails n&apos;est pas encore activé sur ce serveur de test : aucun code ne peut arriver pour l&apos;instant. Demande à l&apos;équipe.
              </Notice>
            ) : null}
            <Field label="Code reçu" icon="lock" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="123456" maxLength={6} />
            <Field label="Nouveau mot de passe" icon="lock" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="8 caractères minimum" onSubmitEditing={reset} returnKeyType="go" />
            {error ? <Notice icon="info">{error}</Notice> : null}
            <Button label="Changer mon mot de passe" onPress={reset} loading={busy} disabled={!/^\d{6}$/.test(code) || password.length < 8} />
            <Button label="Renvoyer un code" variant="ghost" onPress={send} disabled={busy} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
