import { ApiError, api } from "./api";
import type { EventType } from "./types";

let misses = 0;

/**
 * Signal de goût (POST /events, v1.1). Ne bloque jamais l'UI et n'affiche aucune erreur.
 * Si l'endpoint semble absent (404 générique / 405 répétés), on arrête d'envoyer pour la session.
 */
export function track(type: EventType, placeId: string | null | undefined): void {
  if (misses >= 3 || !placeId) return;
  api
    .event(type, placeId)
    .then(() => {
      misses = 0;
    })
    .catch((e: unknown) => {
      const routeMissing = e instanceof ApiError && (e.status === 405 || (e.status === 404 && e.detail === "Not Found"));
      if (routeMissing) misses++;
    });
}

/** Pour les tests. */
export function resetEventsSupport(): void {
  misses = 0;
}
