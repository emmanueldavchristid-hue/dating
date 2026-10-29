import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice, useToast } from "@/components/feedback";
import { PrefsEditor } from "@/components/PrefsEditor";
import { goBack, ScreenHeader } from "@/components/Screen";
import { Button, hapticSuccess } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import { errorMessage } from "@/lib/api";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function PreferencesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { prefs, savePrefs } = useSettings();
  const toast = useToast();
  const [draft, setDraft] = useState(prefs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePrefs(draft);
      hapticSuccess();
      toast("Préférences enregistrées", "check");
      goBack("/me");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Mes préférences" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: space[6], gap: space[4] }}>
        {!user ? <Notice icon="info">Enregistrées sur ce téléphone. Connecte-toi pour les synchroniser avec ton compte.</Notice> : null}
        <PrefsEditor value={draft} onChange={setDraft} />
        {error ? <Notice icon="info">{error}</Notice> : null}
      </ScrollView>
      <View style={{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: colors.border }}>
        <Button label="Enregistrer" icon="check" onPress={save} loading={busy} />
      </View>
    </View>
  );
}
