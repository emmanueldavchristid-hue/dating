/** Suivi d'un trajet en direct : où en est-on sur le tracé, ce qui reste, est-on arrivé ou sorti de la route. */
import { haversineKm } from "./format";

export type Pt = { lat: number; lng: number };

export interface TripProgress {
  /** Index du point du tracé le plus proche de la position actuelle. */
  index: number;
  /** Distance entre la position et le tracé (m) : au-delà de ~80 m, on est sorti de la route. */
  offRouteM: number;
  /** Ce qui reste à parcourir le long du tracé (km). */
  remainingKm: number;
  /** Temps restant estimé (min), au prorata de la durée calculée du trajet. */
  remainingMin: number;
  /** Part du trajet déjà faite, de 0 à 1. */
  done: number;
  arrived: boolean;
}

const km = (a: Pt, b: Pt) => haversineKm(a, b) ?? 0;

export function pathLengthKm(path: Pt[], from = 0): number {
  let total = 0;
  for (let i = from + 1; i < path.length; i++) total += km(path[i - 1]!, path[i]!);
  return total;
}

export function tripProgress(path: Pt[], totalMinutes: number, here: Pt): TripProgress {
  if (path.length < 2) {
    return { index: 0, offRouteM: 0, remainingKm: 0, remainingMin: 0, done: 1, arrived: true };
  }
  let index = 0;
  let best = Infinity;
  path.forEach((p, i) => {
    const d = km(p, here);
    if (d < best) {
      best = d;
      index = i;
    }
  });
  const total = pathLengthKm(path);
  const remainingKm = best + pathLengthKm(path, index);
  const destM = km(here, path[path.length - 1]!) * 1000;
  const ratio = total > 0 ? Math.min(1, remainingKm / total) : 0;
  return {
    index,
    offRouteM: Math.round(best * 1000),
    remainingKm: Math.round(remainingKm * 10) / 10,
    remainingMin: Math.max(destM < 60 ? 0 : 1, Math.round(totalMinutes * ratio)),
    done: Math.max(0, Math.min(1, 1 - ratio)),
    arrived: destM < 60,
  };
}
