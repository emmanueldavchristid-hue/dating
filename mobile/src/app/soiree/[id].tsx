import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState, Notice, RowSkeleton, useToast } from "@/components/feedback";
import { goBack, ScreenHeader } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Timeline } from "@/components/Timeline";
import { Button, IconButton, Txt } from "@/components/ui";
import { useMeta } from "@/context/MetaContext";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { totalBudget } from "@/lib/itinerary";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function SoireeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { catName } = useMeta();
  const toast = useToast();
  const it = useAsync(() => api.itineraries.get(String(id)), [id]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const steps = [...(it.data?.steps ?? [])].sort((a, b) => a.position - b.position);

  const remove = async () => {
    setBusy(true);
    try {
      await api.itineraries.remove(String(id));
      setConfirm(false);
      toast("Soirée supprimée", "trash");
      goBack("/soiree");
    } catch (e) {
      toast(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Soirée" right={<IconButton icon="trash" label="Supprimer la soirée" onPress={() => setConfirm(true)} size={42} color={colors.danger} />} />
      {it.error ? (
        <ErrorState error={it.error} onRetry={it.reload} />
      ) : it.loading || !it.data ? (
        <View style={{ padding: GUTTER, gap: 12 }}>
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: space[4] }}>
          <View style={{ gap: 4 }}>
            <Txt variant="h1">{it.data.title}</Txt>
            <Txt variant="body" color={colors.textMuted}>
              {[formatDate(it.data.date), `${steps.length} étape${steps.length > 1 ? "s" : ""}`, totalBudget(steps)].filter(Boolean).join(" · ")}
            </Txt>
          </View>
          <Timeline steps={steps} catName={catName} />
          <Notice icon="info">Distances à vol d&apos;oiseau entre les étapes : le temps de trajet réel n&apos;est pas estimé.</Notice>
        </ScrollView>
      )}
      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Supprimer cette soirée ?"
        footer={
          <>
            <Button label="Annuler" variant="ghost" full={false} style={{ width: 120 }} onPress={() => setConfirm(false)} />
            <Button label="Supprimer" variant="danger" style={{ flex: 1 }} onPress={remove} loading={busy} />
          </>
        }
      >
        <Txt variant="body" color={colors.textMuted}>
          Cette action est définitive.
        </Txt>
      </Sheet>
    </View>
  );
}
