import { ApiError, api, buildQuery, classifyError, errorMessage, isUnsupported, onUnauthorized, parseErrorBody, request, setToken } from "@/lib/api";

jest.mock("@/lib/storage", () => ({ readSecure: jest.fn(async () => null), writeSecure: jest.fn(async () => {}) }));

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

describe("classification des erreurs", () => {
  it.each([
    [0, "network_error", "network"],
    [403, "premium_required", "premium"],
    [403, "forbidden", "forbidden"],
    [429, "quota_exceeded", "quota"],
    [429, "rate_limited", "rate_limited"],
    [501, "not_configured", "not_configured"],
    [401, "unauthorized", "auth"],
    [404, "not_found", "not_found"],
    [409, "conflict", "conflict"],
    [422, "validation_error", "validation"],
    [500, "http_500", "server"],
  ])("%i %s → %s", (status, code, kind) => {
    expect(classifyError(status, code)).toBe(kind);
  });

  it("lit {detail, code}", () => {
    const e = parseErrorBody(403, { detail: "Contenu réservé", code: "premium_required" });
    expect(e.kind).toBe("premium");
    expect(errorMessage(e)).toBe("Contenu réservé");
  });

  it("aplatit le détail FastAPI 422", () => {
    const e = parseErrorBody(422, { detail: [{ msg: "Champ requis" }, { msg: "Trop court" }] });
    expect(e.code).toBe("validation_error");
    expect(e.detail).toBe("Champ requis · Trop court");
  });

  it("message par défaut si corps vide", () => {
    expect(parseErrorBody(501, null).detail).toBe("Bientôt disponible.");
    expect(parseErrorBody(401, null).code).toBe("unauthorized");
  });

  it("endpoint v1.1 absent → isUnsupported", () => {
    expect(isUnsupported(new ApiError(404, "not_found", "Not Found"))).toBe(true);
    expect(isUnsupported(new ApiError(405, "http_405", ""))).toBe(true);
    expect(isUnsupported(new ApiError(500, "http_500", ""))).toBe(false);
    expect(isUnsupported(new Error("x"))).toBe(false);
  });
});

describe("requêtes", () => {
  afterEach(async () => {
    onUnauthorized(null);
    await setToken(null);
  });

  it("sérialise la query (listes jointes, vides et false omis)", () => {
    expect(buildQuery({ categories: ["bar", "lounge"], q: "", open_now: false, parking: true, page: 2, x: undefined })).toBe(
      "?categories=bar%2Clounge&parking=true&page=2",
    );
    expect(buildQuery({})).toBe("");
  });

  it("joint le jeton et renvoie le JSON", async () => {
    await setToken("abc");
    mockFetch(200, { status: "ok", db: "ok" });
    await expect(api.health()).resolves.toEqual({ status: "ok", db: "ok" });
    await expect(request("/me")).resolves.toEqual({ status: "ok", db: "ok" });
    const headers = (global.fetch as jest.Mock).mock.calls[1][1].headers;
    expect(headers.Authorization).toBe("Bearer abc");
  });

  it("204 → undefined", async () => {
    mockFetch(204, undefined);
    await expect(api.favorites.add("p1")).resolves.toBeUndefined();
  });

  it("401 avec jeton → déconnexion", async () => {
    await setToken("expired");
    const handler = jest.fn();
    onUnauthorized(handler);
    mockFetch(401, { detail: "Jeton invalide", code: "unauthorized" });
    await expect(api.me.get()).rejects.toMatchObject({ kind: "auth" });
    expect(handler).toHaveBeenCalled();
  });

  it("501 checkout → not_configured (aucun paiement simulé)", async () => {
    mockFetch(501, { detail: "Le paiement n'est pas encore activé.", code: "not_configured" });
    await expect(api.billing.checkout("plus")).rejects.toMatchObject({ kind: "not_configured", status: 501 });
  });

  it("erreur réseau → kind network", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(api.health()).rejects.toMatchObject({ kind: "network", status: 0 });
  });

  it("concierge envoie au plus 6 messages d'historique", async () => {
    mockFetch(200, { reply: "ok", places: [] });
    const history = Array.from({ length: 9 }, (_, i) => ({ role: "user" as const, content: `m${i}` }));
    await api.concierge("salut", { city: "abidjan" }, history);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.history).toHaveLength(6);
    expect(body.history[0].content).toBe("m3");
    expect(body.city).toBe("abidjan");
  });
});
