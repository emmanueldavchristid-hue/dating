import { api, isUnsupported } from "./api";
import type { EventType } from "./types";

let unsupported = false;

/**
 * Signal de goût (POST /events, v1.1). Ne bloque jamais l'UI et n'affiche aucune erreur.
 * Si l'endpoint n'existe pas encore (404/405), on arrête d'envoyer pour la session.
 */
export function track(type: EventType, placeId: string | null | undefined): void {
  if (unsupported || !placeId) return;
  api.event(type, placeId).catch((e: unknown) => {
    if (isUnsupported(e)) unsupported = true;
  });
}

/** Pour les tests. */
export function resetEventsSupport(): void {
  unsupported = false;
}
