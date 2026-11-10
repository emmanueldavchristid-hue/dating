import { resetEventsSupport, track } from "@/lib/events";

jest.mock("@/lib/storage", () => ({ readSecure: jest.fn(async () => null), writeSecure: jest.fn(async () => {}) }));

const flush = () => new Promise((r) => setTimeout(r, 0));

function fetchReturning(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({ status, ok: status < 300, text: async () => JSON.stringify(body) })) as unknown as typeof fetch;
}

describe("POST /events (fire-and-forget)", () => {
  beforeEach(resetEventsSupport);

  it("n'émet aucune erreur et s'arrête si la route n'existe pas (404 générique)", async () => {
    fetchReturning(404, { detail: "Not Found", code: "not_found" });
    for (let i = 0; i < 5; i++) {
      track("view", "p1");
      await flush();
      await flush();
    }
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3);
  });

  it("continue d'envoyer si le lieu est simplement introuvable", async () => {
    fetchReturning(404, { detail: "Lieu introuvable", code: "not_found" });
    for (let i = 0; i < 4; i++) {
      track("share", "p1");
      await flush();
      await flush();
    }
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(4);
  });

  it("ignore un id absent", () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    track("view", null);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
