import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, type MapStyleElement } from "react-native-maps";
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

export function PlacesMap({ places, selectedId, onSelect, center, user, recenterKey, bottomInset, onRegionChange, route }: PlacesMapProps) {
  const ref = useRef<MapView>(null);
  const start = user ?? center;

  useEffect(() => {
    const p = places.find((x) => x.id === selectedId);
    if (p?.location) ref.current?.animateCamera({ center: { latitude: p.location.lat, longitude: p.location.lng } }, { duration: 350 });
  }, [selectedId, places]);

  // Trajet affiché : la carte cadre le départ et l'arrivée.
  useEffect(() => {
    if (!route || route.length < 2) return;
    ref.current?.fitToCoordinates(
      route.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      { edgePadding: { top: 160, right: 40, bottom: bottomInset + 120, left: 40 }, animated: true },
    );
  }, [route, bottomInset]);

  useEffect(() => {
    if (recenterKey === 0) return;
    const c = user ?? center;
    ref.current?.animateToRegion({ latitude: c.lat, longitude: c.lng, ...DELTA }, 400);
  }, [recenterKey, user, center]);

  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      initialRegion={{ latitude: start.lat, longitude: start.lng, ...DELTA }}
      onRegionChangeComplete={(r, details) => {
        if (details && details.isGesture === false) return; // seulement les déplacements faits par l'utilisateur
        // rayon ≈ demi-hauteur visible (1° de latitude ≈ 111 km)
        onRegionChange?.({ lat: r.latitude, lng: r.longitude, km: Math.max(1, (r.latitudeDelta * 111) / 2) });
      }}
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
      {route && route.length > 1 ? (
        <Polyline coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
      ) : null}
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
