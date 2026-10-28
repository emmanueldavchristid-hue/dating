import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";
import type { ReactElement } from "react";
import { colors } from "@/theme/tokens";

/** Jeu d'icônes au trait (24×24, trait 2, extrémités arrondies). Aucune police d'icônes externe. */
const P = (d: string) => <Path d={d} />;

const ICONS = {
  compass: (
    <>
      <Circle cx={12} cy={12} r={10} />
      {P("m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z")}
    </>
  ),
  map: (
    <>
      {P("M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3z")}
      <Line x1={9} y1={3} x2={9} y2={18} />
      <Line x1={15} y1={6} x2={15} y2={21} />
    </>
  ),
  gem: (
    <>
      {P("M6 3h12l4 6-10 12L2 9z")}
      {P("M2 9h20")}
      {P("m12 21-4-12 2-6m2 18 4-12-2-6")}
    </>
  ),
  sparkles: (
    <>
      {P("M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z")}
      {P("M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z")}
      {P("M5 2.5l.6 1.4L7 4.5l-1.4.6L5 6.5l-.6-1.4L3 4.5l1.4-.6z")}
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      {P("M4 21c0-4 3.6-7 8-7s8 3 8 7")}
    </>
  ),
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Line x1={20.5} y1={20.5} x2={16.2} y2={16.2} />
    </>
  ),
  sliders: (
    <>
      <Line x1={4} y1={6} x2={14} y2={6} />
      <Line x1={18} y1={6} x2={20} y2={6} />
      <Circle cx={16} cy={6} r={2} />
      <Line x1={4} y1={12} x2={6} y2={12} />
      <Line x1={10} y1={12} x2={20} y2={12} />
      <Circle cx={8} cy={12} r={2} />
      <Line x1={4} y1={18} x2={12} y2={18} />
      <Line x1={16} y1={18} x2={20} y2={18} />
      <Circle cx={14} cy={18} r={2} />
    </>
  ),
  heart: P(
    "M19.5 12.6 12 20l-7.5-7.4A4.9 4.9 0 0 1 12 6.2a4.9 4.9 0 0 1 7.5 6.4z",
  ),
  share: (
    <>
      {P("M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7")}
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
    </>
  ),
  navigation: P("M3 11 22 2l-9 19-2-8-8-2z"),
  phone: P(
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  ),
  flag: (
    <>
      {P("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z")}
      <Line x1={4} y1={22} x2={4} y2={15} />
    </>
  ),
  star: P("m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"),
  lock: (
    <>
      <Rect x={4} y={11} width={16} height={10} rx={2.5} />
      {P("M8 11V7a4 4 0 0 1 8 0v4")}
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      <Polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  pin: (
    <>
      {P("M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z")}
      <Circle cx={12} cy={10} r={3} />
    </>
  ),
  chevronLeft: <Polyline points="15 18 9 12 15 6" />,
  chevronRight: <Polyline points="9 18 15 12 9 6" />,
  chevronDown: <Polyline points="6 9 12 15 18 9" />,
  chevronUp: <Polyline points="18 15 12 9 6 15" />,
  x: (
    <>
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </>
  ),
  plus: (
    <>
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </>
  ),
  check: <Polyline points="20 6 9 17 4 12" />,
  trash: (
    <>
      <Polyline points="3 6 5 6 21 6" />
      {P("M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")}
    </>
  ),
  locate: (
    <>
      <Circle cx={12} cy={12} r={7} />
      <Circle cx={12} cy={12} r={2.5} />
      <Line x1={12} y1={1.5} x2={12} y2={5} />
      <Line x1={12} y1={19} x2={12} y2={22.5} />
      <Line x1={1.5} y1={12} x2={5} y2={12} />
      <Line x1={19} y1={12} x2={22.5} y2={12} />
    </>
  ),
  crown: (
    <>
      {P("M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z")}
    </>
  ),
  route: (
    <>
      <Circle cx={6} cy={19} r={2.5} />
      <Circle cx={18} cy={5} r={2.5} />
      {P("M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5")}
    </>
  ),
  bookmark: P("M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"),
  settings: (
    <>
      <Line x1={4} y1={21} x2={4} y2={14} />
      <Line x1={4} y1={10} x2={4} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={12} />
      <Line x1={12} y1={8} x2={12} y2={3} />
      <Line x1={20} y1={21} x2={20} y2={16} />
      <Line x1={20} y1={12} x2={20} y2={3} />
      <Line x1={1} y1={14} x2={7} y2={14} />
      <Line x1={9} y1={8} x2={15} y2={8} />
      <Line x1={17} y1={16} x2={23} y2={16} />
    </>
  ),
  logout: (
    <>
      {P("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4")}
      <Polyline points="16 17 21 12 16 7" />
      <Line x1={21} y1={12} x2={9} y2={12} />
    </>
  ),
  info: (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      <Line x1={12} y1={16} x2={12} y2={11} />
      <Line x1={12} y1={8} x2={12.01} y2={8} />
    </>
  ),
  shield: (
    <>
      {P("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z")}
      <Polyline points="9 12 11 14 15 10" />
    </>
  ),
  download: (
    <>
      {P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4")}
      <Polyline points="7 10 12 15 17 10" />
      <Line x1={12} y1={15} x2={12} y2={3} />
    </>
  ),
  car: (
    <>
      {P("M5 17H3v-5l2-5h14l2 5v5h-2")}
      <Line x1={3} y1={12} x2={21} y2={12} />
      <Circle cx={7.5} cy={17} r={2} />
      <Circle cx={16.5} cy={17} r={2} />
      <Line x1={9.5} y1={17} x2={14.5} y2={17} />
    </>
  ),
  accessibility: (
    <>
      <Circle cx={12} cy={4} r={1.6} />
      {P("M5 8.5l7 1.5 7-1.5M12 10v4m0 0-3 7m3-7 3 7")}
    </>
  ),
  wifi: (
    <>
      {P("M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0")}
      <Line x1={12} y1={19.5} x2={12.01} y2={19.5} />
    </>
  ),
  wifiOff: (
    <>
      <Line x1={2} y1={2} x2={22} y2={22} />
      {P("M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.2-2.7M16.7 10.3A10 10 0 0 1 19 12.5M2 9a15 15 0 0 1 4.2-2.7M10.7 5.1A15 15 0 0 1 22 9")}
      <Line x1={12} y1={19.5} x2={12.01} y2={19.5} />
    </>
  ),
  card: (
    <>
      <Rect x={2} y={5} width={20} height={14} rx={2.5} />
      <Line x1={2} y1={10} x2={22} y2={10} />
    </>
  ),
  smartphone: (
    <>
      <Rect x={6} y={2} width={12} height={20} rx={2.5} />
      <Line x1={12} y1={18} x2={12.01} y2={18} />
    </>
  ),
  sun: (
    <>
      <Circle cx={12} cy={12} r={4} />
      {P("M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4")}
    </>
  ),
  send: (
    <>
      <Line x1={22} y1={2} x2={11} y2={13} />
      {P("M22 2 15 22l-4-9-9-4z")}
    </>
  ),
  refresh: (
    <>
      <Polyline points="23 4 23 10 17 10" />
      {P("M20.5 15a9 9 0 1 1-2.1-9.4L23 10")}
    </>
  ),
  arrowUp: (
    <>
      <Line x1={12} y1={19} x2={12} y2={5} />
      <Polyline points="5 12 12 5 19 12" />
    </>
  ),
  arrowDown: (
    <>
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Polyline points="19 12 12 19 5 12" />
    </>
  ),
  arrowRight: (
    <>
      <Line x1={5} y1={12} x2={19} y2={12} />
      <Polyline points="12 5 19 12 12 19" />
    </>
  ),
  globe: (
    <>
      <Circle cx={12} cy={12} r={9.5} />
      {P("M2.5 12h19M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19z")}
    </>
  ),
  edit: (
    <>
      {P("M12 20h9")}
      {P("M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z")}
    </>
  ),
  moon: P("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"),
  // Catégories
  utensils: (
    <>
      {P("M3 2v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2M6 2v20")}
      {P("M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7")}
    </>
  ),
  flame: P(
    "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.6 1.4 2.8 2.5 2.8z",
  ),
  sofa: (
    <>
      {P("M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3")}
      {P("M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z")}
      <Line x1={5} y1={18} x2={5} y2={21} />
      <Line x1={19} y1={18} x2={19} y2={21} />
    </>
  ),
  building: (
    <>
      <Rect x={4} y={2} width={16} height={20} rx={2} />
      {P("M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01")}
    </>
  ),
  waves: P(
    "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
  ),
  leaf: (
    <>
      {P("M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z")}
      {P("M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12")}
    </>
  ),
  glass: (
    <>
      {P("M8 22h8M12 15v7M5 3h14l-1 6a6 6 0 0 1-12 0z")}
      <Line x1={5.5} y1={7} x2={18.5} y2={7} />
    </>
  ),
  coffee: (
    <>
      {P("M17 8h1a4 4 0 1 1 0 8h-1")}
      {P("M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z")}
      <Line x1={6} y1={2} x2={6} y2={4} />
      <Line x1={10} y1={2} x2={10} y2={4} />
      <Line x1={14} y1={2} x2={14} y2={4} />
    </>
  ),
  ticket: (
    <>
      {P("M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z")}
      {P("M13 5v2M13 17v2M13 11v2")}
    </>
  ),
  palette: (
    <>
      {P("M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.5a1.5 1.5 0 0 0-1.1 2.5c.4.4.6.9.6 1.5 0 1.1-.9 2-2 2z")}
      <Circle cx={7.5} cy={10.5} r={1} />
      <Circle cx={10.5} cy={6.5} r={1} />
      <Circle cx={15.5} cy={7.5} r={1} />
    </>
  ),
  music: (
    <>
      {P("M9 18V5l12-2v13")}
      <Circle cx={6} cy={18} r={3} />
      <Circle cx={18} cy={16} r={3} />
    </>
  ),
  calendar: (
    <>
      <Rect x={3} y={4} width={18} height={18} rx={2.5} />
      <Line x1={16} y1={2} x2={16} y2={6} />
      <Line x1={8} y1={2} x2={8} y2={6} />
      <Line x1={3} y1={10} x2={21} y2={10} />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 22,
  color = colors.text,
  strokeWidth = 1.9,
  fill = "none",
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {ICONS[name]}
    </Svg>
  );
}

/** Icône associée au slug « icon » renvoyé par /meta/categories (ou au slug de catégorie). */
const CATEGORY_ICONS: Record<string, IconName> = {
  utensils: "utensils",
  flame: "flame",
  sofa: "sofa",
  building: "building",
  waves: "waves",
  leaf: "leaf",
  glass: "glass",
  coffee: "coffee",
  ticket: "ticket",
  palette: "palette",
  music: "music",
  calendar: "calendar",
  restaurant: "utensils",
  maquis: "flame",
  lounge: "sofa",
  rooftop: "building",
  plage: "waves",
  nature: "leaf",
  bar: "glass",
  cafe: "coffee",
  activite: "ticket",
  culture: "palette",
  club: "music",
  evenement: "calendar",
};

export function categoryIcon(slugOrIcon: string | null | undefined): IconName {
  return (slugOrIcon && CATEGORY_ICONS[slugOrIcon]) || "compass";
}
