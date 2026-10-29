import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice } from "@/components/feedback";
import { goBack, ScreenHeader } from "@/components/Screen";
import { Button, Field, hapticSuccess, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { errorMessage } from "@/lib/api";
import { APP_NAME } from "@/lib/config";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /\S+@\S+\.\S+/.test(email.trim()) && password.length > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
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
      <ScreenHeader title="Connexion" close />
      <ScrollView contentContainerStyle={{ padding: GUTTER, gap: space[4], paddingBottom: insets.bottom + space[5] }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Txt variant="h1">Bon retour</Txt>
          <Txt variant="body" color={colors.textMuted}>
            Retrouve tes favoris, tes soirées et ton concierge {APP_NAME}.
          </Txt>
        </View>
        <Field label="E-mail" icon="mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="toi@exemple.com" returnKeyType="next" />
        <Field label="Mot de passe" icon="lock" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="••••••••" onSubmitEditing={submit} returnKeyType="go" />
        {error ? <Notice icon="info">{error}</Notice> : null}
        <Button label="Se connecter" onPress={submit} loading={busy} disabled={!valid} />
        <PressableScale onPress={() => router.replace("/register")} accessibilityRole="link" accessibilityLabel="Créer un compte" style={{ alignSelf: "center", padding: 10 }}>
          <Txt variant="label" color={colors.textMuted}>
            Pas encore de compte ? <Txt variant="label" color={colors.accent}>Créer un compte</Txt>
          </Txt>
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
