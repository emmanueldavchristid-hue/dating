import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, ErrorState, Notice, RowSkeleton, useToast } from "@/components/feedback";
import { Icon } from "@/components/Icon";
import { ScreenHeader } from "@/components/Screen";
import { Sheet } from "@/components/Sheet";
import { Button, Field, IconButton, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, radius, space } from "@/theme/tokens";

export default function Collections() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => api.collections.list(), [user?.id], !!user);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.collections.create(name.trim(), desc.trim() || undefined);
      setOpen(false);
      setName("");
      setDesc("");
      toast("Collection créée", "bookmark");
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Collections" right={user ? <IconButton icon="plus" label="Nouvelle collection" onPress={() => setOpen(true)} size={42} color={colors.onAccent} bg={colors.accent} border={colors.accent} /> : null} />
      {!user ? (
        <EmptyState icon="bookmark" title="Connecte-toi" body="Tes collections sont liées à ton compte." action={{ label: "Se connecter", onPress: () => router.push("/login") }} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : list.loading ? (
        <View style={{ padding: GUTTER, gap: 12 }}>
          <RowSkeleton />
        </View>
      ) : (
        <FlatList
          data={list.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: 12 }}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.accent} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
              <PressableScale onPress={() => router.push({ pathname: "/collection/[id]", params: { id: item.id } })} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.count} lieux`} style={s.item}>
                <View style={s.icon}>
                  <Icon name="bookmark" size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="title">{item.name}</Txt>
                  {item.description ? (
                    <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                      {item.description}
                    </Txt>
                  ) : null}
                  <Txt variant="caption" color={colors.textSubtle}>
                    {item.count} lieu{item.count > 1 ? "x" : ""}
                  </Txt>
                </View>
                <Icon name="chevronRight" size={18} color={colors.textSubtle} />
              </PressableScale>
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState icon="bookmark" title="Range tes envies" body="Crée des collections : « Rooftops du vendredi », « Brunchs du dimanche »…" action={{ label: "Nouvelle collection", icon: "plus", onPress: () => setOpen(true) }} />
          }
        />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Nouvelle collection" footer={<Button label="Créer" onPress={create} disabled={!name.trim()} loading={busy} style={{ flex: 1 }} />}>
        <Field label="Nom" placeholder="Ex. Brunchs du dimanche" value={name} onChangeText={setName} maxLength={80} />
        <Field label="Description (facultatif)" placeholder="Pour qui, pour quand…" value={desc} onChangeText={setDesc} maxLength={280} />
        {error ? <Notice icon="info">{error}</Notice> : null}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  icon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
});
