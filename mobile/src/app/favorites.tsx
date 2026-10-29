import { router } from "expo-router";
import { FlatList, RefreshControl, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, ErrorState, RowSkeleton, useToast } from "@/components/feedback";
import { PlaceRow } from "@/components/PlaceCard";
import { ScreenHeader } from "@/components/Screen";
import { IconButton } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { api, errorMessage } from "@/lib/api";
import { useAsync } from "@/lib/useAsync";
import { colors, GUTTER, space } from "@/theme/tokens";

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { catName } = useMeta();
  const toast = useToast();
  const favs = useAsync(() => api.favorites.list(), [user?.id], !!user);

  const remove = async (id: string) => {
    const prev = favs.data ?? [];
    favs.setData(prev.filter((p) => p.id !== id));
    try {
      await api.favorites.remove(id);
      toast("Retiré des favoris", "heart");
    } catch (e) {
      favs.setData(prev);
      toast(errorMessage(e), "info");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Favoris" />
      {!user ? (
        <EmptyState icon="heart" title="Connecte-toi" body="Tes favoris sont liés à ton compte." action={{ label: "Se connecter", onPress: () => router.push("/login") }} />
      ) : favs.error ? (
        <ErrorState error={favs.error} onRetry={favs.reload} />
      ) : favs.loading ? (
        <View style={{ padding: GUTTER, gap: 12 }}>
          <RowSkeleton />
          <RowSkeleton />
        </View>
      ) : (
        <FlatList
          data={favs.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: insets.bottom + space[6], gap: 12 }}
          refreshControl={<RefreshControl refreshing={favs.refreshing} onRefresh={favs.refresh} tintColor={colors.accent} />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
              <PlaceRow
                p={item}
                catName={catName}
                right={<IconButton icon="heart" label={`Retirer ${item.name} des favoris`} onPress={() => remove(item.id)} size={40} color={colors.accent} fill={colors.accent} haptic />}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <EmptyState icon="heart" title="Aucun favori pour l'instant" body="Touche le cœur sur une fiche pour la retrouver ici." action={{ label: "Découvrir des lieux", onPress: () => router.push("/") }} />
          }
        />
      )}
    </View>
  );
}
