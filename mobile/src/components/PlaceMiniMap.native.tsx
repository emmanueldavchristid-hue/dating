import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { colors, radius, themed, themeMode } from "@/theme/tokens";
import { categoryIcon, Icon } from "./Icon";

export const MINI_MAP_SUPPORTED = true;

/** Petite carte fixe sur la fiche d'un lieu : où c'est, sans quitter l'app (le toucher ouvre la grande carte). */
export function PlaceMiniMap({ lat, lng, category }: { lat: number; lng: number; category?: string }) {
  return (
    <View style={s.box} pointerEvents="none">
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
        liteMode
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        userInterfaceStyle={themeMode()}
        showsPointsOfInterests={false}
        accessibilityLabel="Emplacement du lieu sur la carte"
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={s.pin}>
            <Icon name={categoryIcon(category)} size={18} color={colors.onAccent} />
          </View>
        </Marker>
      </MapView>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  box: { height: 150, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 },
  pin: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.bg },
}));
