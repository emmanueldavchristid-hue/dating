import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice } from "@/components/feedback";
import { goBack, ScreenHeader } from "@/components/Screen";
import { Button, Field, hapticSuccess, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api";
import { validateRegister } from "@/lib/validation";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function Register() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const v = validateRegister(name, email, password);
  const ok = !v.name && !v.email && !v.password;

  const submit = async () => {
    setTouched(true);
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await register(email, password, name);
      hapticSuccess();
      goBack();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Créer un compte" close />
      <ScrollView contentContainerStyle={{ padding: GUTTER, gap: space[4], paddingBottom: insets.bottom + space[5] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Txt variant="h1">Bienvenue</Txt>
          <Txt variant="body" color={colors.textMuted}>
            Un compte gratuit pour enregistrer tes lieux, composer tes soirées et parler au concierge.
          </Txt>
        </View>
        <Field label="Prénom ou pseudo" icon="user" value={name} onChangeText={setName} autoComplete="name" placeholder="Aya" error={touched ? v.name : null} maxLength={60} />
        <Field label="E-mail" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="toi@exemple.com" error={touched ? v.email : null} />
        <Field label="Mot de passe" icon="lock" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" placeholder="8 caractères minimum" error={touched ? v.password : null} hint="8 caractères minimum." onSubmitEditing={submit} />
        {error ? <Notice icon="info">{error}</Notice> : null}
        <Button label="Créer mon compte" onPress={submit} loading={busy} />
        <Txt variant="caption" color={colors.textSubtle} style={{ textAlign: "center" }}>
          Tes données restent exportables et supprimables à tout moment depuis « Moi ».
        </Txt>
        <PressableScale onPress={() => router.replace("/login")} accessibilityRole="link" accessibilityLabel="J'ai déjà un compte" style={{ alignSelf: "center", padding: 10 }}>
          <Txt variant="label" color={colors.textMuted}>
            Déjà inscrit ? <Txt variant="label" color={colors.accent}>Se connecter</Txt>
          </Txt>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
