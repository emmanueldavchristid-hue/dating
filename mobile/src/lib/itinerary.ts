import { formatBudgetRange, haversineKm } from "./format";
import type { PlaceCard } from "./types";

export type Leg = { place: PlaceCard; leg_km: number | null };

/** Recalcule les distances à vol d'oiseau entre étapes après réordonnancement (même calcul que le serveur). */
export function relegs<T extends Leg>(steps: T[]): T[] {
  return steps.map((st, i) => ({ ...st, leg_km: i === 0 ? null : haversineKm(steps[i - 1]!.place.location, st.place.location) }));
}

/** Budget cumulé ; null si une étape n'a pas de budget connu (on n'invente pas). */
export function totalBudget(steps: Leg[]): string | null {
  if (!steps.length || steps.some((s) => s.place.budget_min_fcfa == null || s.place.budget_max_fcfa == null)) return null;
  const min = steps.reduce((a, s) => a + (s.place.budget_min_fcfa ?? 0), 0);
  const max = steps.reduce((a, s) => a + (s.place.budget_max_fcfa ?? 0), 0);
  return formatBudgetRange(min, max);
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
}
