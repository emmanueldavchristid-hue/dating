/** Une question en langage naturel part au concierge, une requête courte à la recherche. */
export function routeForQuery(q: string): string {
  const t = q.trim();
  if (!t) return "/search";
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words >= 4 || /\?$/.test(t)) return `/concierge?q=${encodeURIComponent(t)}`;
  return `/search?q=${encodeURIComponent(t)}`;
}

/** Évite les redirections ouvertes : seul un chemin interne est accepté. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
