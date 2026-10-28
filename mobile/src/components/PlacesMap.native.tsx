import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, type MapStyleElement } from "react-native-maps";
import { colors } from "@/theme/tokens";
import { categoryIcon, Icon } from "./Icon";
import type { PlacesMapProps } from "./PlacesMap.types";

export const MAP_SUPPORTED = true;

// Style sombre (Google Maps / Android). Sur iOS, Plans utilise userInterfaceStyle="dark".
const DARK: MapStyleElement[] = [
  { elementType: "geometry", stylers: [{ color: "#15171d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b8e9a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0e0f13" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#262933" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3e4a" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0b1622" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4c5a72" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a2d37" }] },
];

const DELTA = { latitudeDelta: 0.09, longitudeDelta: 0.09 };

export function PlacesMap({ places, selectedId, onSelect, center, user, recenterKey, bottomInset }: PlacesMapProps) {
  const ref = useRef<MapView>(null);

  useEffect(() => {
    const p = places.find((x) => x.id === selectedId);
    if (p?.location) ref.current?.animateCamera({ center: { latitude: p.location.lat, longitude: p.location.lng } }, { duration: 350 });
  }, [selectedId, places]);

  useEffect(() => {
    if (recenterKey === 0) return;
    const c = user ?? center;
    ref.current?.animateToRegion({ latitude: c.lat, longitude: c.lng, ...DELTA }, 400);
  }, [recenterKey, user, center]);

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={{ latitude: center.lat, longitude: center.lng, ...DELTA }}
      customMapStyle={DARK}
      userInterfaceStyle="dark"
      showsUserLocation={!!user}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      showsCompass={false}
      mapPadding={{ top: 0, right: 0, left: 0, bottom: bottomInset }}
      accessibilityLabel="Carte des lieux"
    >
      {places.map((p) => {
        if (!p.location) return null;
        const selected = p.id === selectedId;
        const gold = p.tier === "premium";
        const bg = selected ? (gold ? colors.gold : colors.accent) : colors.surface3;
        const fg = selected ? colors.onAccent : gold ? colors.gold : colors.text;
        return (
          <Marker
            key={`${p.id}-${selected ? 1 : 0}`}
            coordinate={{ latitude: p.location.lat, longitude: p.location.lng }}
            onPress={() => onSelect(p.id)}
            tracksViewChanges={Platform.OS === "ios"}
            anchor={{ x: 0.5, y: 1 }}
            title={p.name}
            accessibilityLabel={p.name}
            zIndex={selected ? 10 : 1}
          >
            <View style={s.wrap}>
              <View style={[s.pin, { backgroundColor: bg, borderColor: gold ? colors.gold : selected ? colors.accent : colors.borderHover }, selected ? s.pinSel : null]}>
                <Icon name={gold && !selected ? "gem" : categoryIcon(p.categories[0])} size={selected ? 20 : 16} color={fg} />
              </View>
              <View style={[s.tail, { borderTopColor: gold ? colors.gold : selected ? colors.accent : colors.borderHover }]} />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center" },
  pin: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  pinSel: { width: 44, height: 44, borderRadius: 22 },
  tail: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: "transparent", borderRightColor: "transparent", marginTop: -1 },
});
