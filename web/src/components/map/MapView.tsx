"use client";

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLng, PlaceCard } from "@/lib/types";

export interface MapViewProps {
  places: PlaceCard[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  center: LatLng;
  user: LatLng | null;
  /** Incrémenter pour recentrer la carte. */
  recenterKey: number;
  onTilesFailed: () => void;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const PIN = (inner: string, cls: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div class="sortie-pin ${cls}" role="img" aria-label="${escapeHtml(label)}"><span>${inner}</span></div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
  });

const DOT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>';
const GEM =
  '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M6 3h12l3 6-9 12L3 9z"/></svg>';

function Fit({ places, center, user, recenterKey }: { places: PlaceCard[]; center: LatLng; user: LatLng | null; recenterKey: number }) {
  const map = useMap();
  const first = useRef(true);
  const sig = places.map((p) => p.id).join(",");
  useEffect(() => {
    const pts = places.filter((p) => p.location).map((p) => [p.location!.lat, p.location!.lng] as [number, number]);
    if (user) pts.push([user.lat, user.lng]);
    if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: !first.current, maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 14, { animate: !first.current });
    else map.setView([center.lat, center.lng], 12, { animate: !first.current });
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  useEffect(() => {
    if (recenterKey === 0) return;
    const target = user ?? center;
    map.setView([target.lat, target.lng], 14, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);
  return null;
}

function ClickAway({ onSelect }: { onSelect: (id: string | null) => void }) {
  useMapEvents({ click: () => onSelect(null) });
  return null;
}

export default function MapView({ places, selectedId, onSelect, center, user, recenterKey, onTilesFailed }: MapViewProps) {
  const errors = useRef(0);
  const loaded = useRef(0);
  const icons = useMemo(
    () => ({
      normal: (name: string) => PIN(DOT, "", name),
      selected: (name: string) => PIN(DOT, "is-selected", name),
      gem: (name: string) => PIN(GEM, "is-gem", name),
      gemSelected: (name: string) => PIN(GEM, "is-gem is-selected", name),
      user: L.divIcon({ className: "", html: '<div class="sortie-me" aria-label="Votre position"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
    }),
    [],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      style={{ width: "100%", height: "100%" }}
      zoomControl
      attributionControl
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        maxZoom={19}
        eventHandlers={{
          tileerror: () => {
            errors.current += 1;
            if (errors.current >= 6 && loaded.current === 0) onTilesFailed();
          },
          tileload: () => {
            loaded.current += 1;
          },
        }}
      />
      <Fit places={places} center={center} user={user} recenterKey={recenterKey} />
      <ClickAway onSelect={onSelect} />
      {user ? <Marker position={[user.lat, user.lng]} icon={icons.user} interactive={false} keyboard={false} /> : null}
      {places.map((p) => {
        if (!p.location) return null;
        const sel = p.id === selectedId;
        const gem = p.tier === "premium";
        const icon = gem ? (sel ? icons.gemSelected(p.name) : icons.gem(p.name)) : sel ? icons.selected(p.name) : icons.normal(p.name);
        return (
          <Marker
            key={p.id}
            position={[p.location.lat, p.location.lng]}
            icon={icon}
            title={p.name}
            alt={p.name}
            zIndexOffset={sel ? 1000 : gem ? 100 : 0}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onSelect(p.id);
              },
              keypress: (e) => {
                const k = (e.originalEvent as KeyboardEvent).key;
                if (k === "Enter" || k === " ") onSelect(p.id);
              },
            }}
          />
        );
      })}
    </MapContainer>
  );
}
