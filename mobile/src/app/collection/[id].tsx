import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, ErrorState, RowSkeleton, useToast } from "@/components/feedback";
import { PlaceRow } from "@/components/PlaceCard";
import { goBack, ScreenHeader } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Button, IconButton, Txt } from "@/components/ui";
import { useMeta } from "@/context/MetaContext";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function CollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { catName } = useMeta();
  const toast = useToast();
  const col = useAsync(() => api.collections.get(String(id)), [id]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const removeItem = async (placeId: string) => {
    if (!col.data) return;
    const prev = col.data;
    col.setData({ ...prev, items: prev.items.filter((p) => p.id !== placeId) });
    try {
      await api.collections.removeItem(prev.id, placeId);
      toast("Retiré de la collection", "check");
    } catch (e) {
      col.setData(prev);
      toast(errorMessage(e), "info");
    }
  };

  const removeCollection = async () => {
    setBusy(true);
    try {
      await api.collections.remove(String(id));
      setConfirm(false);
      toast("Collection supprimée", "trash");
      goBack("/collections");
    } catch (e) {
      toast(errorMessage(e), "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={col.data?.name ?? "Collection"} right={<IconButton icon="trash" label="Supprimer la collection" onPress={() => setConfirm(true)} size={42} color={colors.danger} />} />
      {col.error ? (
        <ErrorState error={col.error} onRetry={col.reload} />
      ) : col.loading ? (
        <View style={{ padding: GUTTER, gap: 12 }}>
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : (
        <FlatList
          data={col.data?.items ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: 12 }}
          refreshControl={<RefreshControl refreshing={col.refreshing} onRefresh={col.refresh} tintColor={colors.accent} />}
          ListHeaderComponent={
            col.data?.description ? (
              <Txt variant="body" color={colors.textMuted} style={{ marginBottom: 4 }}>
                {col.data.description}
              </Txt>
            ) : undefined
          }
          renderItem={({ item }) => (
            <PlaceRow p={item} catName={catName} right={<IconButton icon="x" label={`Retirer ${item.name}`} onPress={() => removeItem(item.id)} size={36} />} />
          )}
          ListEmptyComponent={
            <EmptyState icon="bookmark" title="Collection vide" body="Depuis une fiche, touche « Collection » pour ajouter un lieu." action={{ label: "Explorer", onPress: () => router.push("/search") }} />
          }
        />
      )}
      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Supprimer la collection ?"
        footer={
          <>
            <Button label="Annuler" variant="ghost" full={false} style={{ width: 120 }} onPress={() => setConfirm(false)} />
            <Button label="Supprimer" variant="danger" style={{ flex: 1 }} onPress={removeCollection} loading={busy} />
          </>
        }
      >
        <Txt variant="body" color={colors.textMuted}>
          Les lieux ne sont pas supprimés, seulement cette liste.
        </Txt>
      </Sheet>
    </View>
  );
}
