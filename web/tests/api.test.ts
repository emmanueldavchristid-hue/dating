import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, buildQuery, classifyError, itemsOf, normalizeCity, onUnauthorized, parseErrorBody, request, setToken } from "@/lib/api";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("classifyError", () => {
  it.each([
    [403, "premium_required", "premium"],
    [429, "quota_exceeded", "quota"],
    [501, "not_configured", "not_configured"],
    [501, "http_501", "not_configured"],
    [401, "unauthorized", "auth"],
    [403, "forbidden", "forbidden"],
    [404, "not_found", "not_found"],
    [409, "conflict", "conflict"],
    [429, "rate_limited", "rate_limited"],
    [400, "invalid_budget", "validation"],
    [500, "boom", "server"],
    [0, "network_error", "network"],
  ])("%i %s → %s", (status, code, kind) => {
    expect(classifyError(status, code)).toBe(kind);
  });
});

describe("parseErrorBody", () => {
  it("lit le format {detail, code}", () => {
    const e = parseErrorBody(403, { detail: "Réservé aux membres Insider", code: "premium_required" });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe("premium");
    expect(e.detail).toBe("Réservé aux membres Insider");
  });
  it("gère le détail 422 de FastAPI (tableau)", () => {
    const e = parseErrorBody(422, { detail: [{ msg: "champ requis" }, { msg: "trop court" }] });
    expect(e.kind).toBe("validation");
    expect(e.detail).toBe("champ requis · trop court");
  });
  it("fournit un message par défaut si le corps est vide", () => {
    const e = parseErrorBody(501, null);
    expect(e.kind).toBe("not_configured");
    expect(e.detail).toBe("Bientôt disponible.");
  });
});

describe("request", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    onUnauthorized(null);
  });

  it("renvoie le JSON et joint le jeton", async () => {
    const f = mockFetch(200, { ok: true });
    setToken("abc");
    await expect(request("/x")).resolves.toEqual({ ok: true });
    const [, init] = f.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("renvoie undefined sur 204", async () => {
    mockFetch(204, undefined);
    await expect(request("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("transforme premium_required en ApiError(kind=premium)", async () => {
    mockFetch(403, { detail: "Pépite réservée", code: "premium_required" });
    await expect(api.places.get("x")).rejects.toMatchObject({ kind: "premium", status: 403, code: "premium_required" });
  });

  it("transforme quota_exceeded en ApiError(kind=quota)", async () => {
    mockFetch(429, { detail: "3 demandes par jour", code: "quota_exceeded" });
    await expect(api.concierge("salut", { city: "abidjan" })).rejects.toMatchObject({ kind: "quota" });
  });

  it("transforme 501 not_configured en ApiError(kind=not_configured)", async () => {
    mockFetch(501, { detail: "Paiement pas encore activé", code: "not_configured" });
    await expect(api.billing.checkout("plus")).rejects.toMatchObject({ kind: "not_configured", detail: "Paiement pas encore activé" });
  });

  it("401 avec jeton : appelle le gestionnaire de déconnexion", async () => {
    mockFetch(401, { detail: "Jeton expiré", code: "unauthorized" });
    setToken("old");
    const handler = vi.fn();
    onUnauthorized(handler);
    await expect(api.me.get()).rejects.toMatchObject({ kind: "auth" });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("erreur réseau → kind=network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(request("/x")).rejects.toMatchObject({ kind: "network", status: 0 });
  });

  it("construit la query de recherche", async () => {
    const f = mockFetch(200, { items: [], total: 0, page: 1, page_size: 20, origin: { lat: 0, lng: 0, source: "city" } });
    await api.places.search({ city: "abidjan", categories: ["bar", "maquis"], open_now: true, parking: false, q: "" });
    expect(String(f.mock.calls[0][0])).toMatch(/\/places\/search\?city=abidjan&categories=bar%2Cmaquis&open_now=true$/);
  });
});

describe("helpers", () => {
  it("buildQuery ignore les valeurs vides", () => {
    expect(buildQuery({ a: undefined, b: null, c: "", d: false, e: [], f: 0, g: "x" })).toBe("?f=0&g=x");
  });
  it("itemsOf accepte tableau ou liste paginée", () => {
    expect(itemsOf([1, 2])).toEqual([1, 2]);
    expect(itemsOf({ items: [3], total: 1, page: 1, page_size: 25 })).toEqual([3]);
    expect(itemsOf(null)).toEqual([]);
  });
  it("normalizeCity accepte districts string[] ou {slug,name}[]", () => {
    const base = { slug: "abidjan", name: "Abidjan", center: { lat: 5, lng: -4 } };
    expect(normalizeCity({ ...base, districts: ["Deux Plateaux"] }).districts).toEqual([{ slug: "deux-plateaux", name: "Deux Plateaux" }]);
    expect(normalizeCity({ ...base, districts: [{ slug: "angre", name: "Angré" }] }).districts).toEqual([{ slug: "angre", name: "Angré" }]);
  });
});
