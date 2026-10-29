import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setToken } from "@/lib/api";
import {
  MAX_PHOTO_BYTES,
  PHOTO_ERRORS,
  buildPhotoForm,
  canManagePhotos,
  creditLabel,
  isCoverPhoto,
  photoErrorMessage,
  uploadPlacePhoto,
  validatePhotoFile,
} from "@/lib/photos";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const jpeg = (size = 1024, name = "terrasse.jpg", type = "image/jpeg") => new File([new Uint8Array(size)], name, { type });

describe("formulaire multipart", () => {
  it("fichier, crédit nettoyé et make_cover", () => {
    const form = buildPhotoForm(jpeg(), { credit: "  Awa K.  ", makeCover: true });
    const file = form.get("file") as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("terrasse.jpg");
    expect(form.get("credit")).toBe("Awa K.");
    expect(form.get("make_cover")).toBe("true");
  });

  it("crédit vide omis, make_cover=false par défaut, crédit tronqué à 160", () => {
    const f1 = buildPhotoForm(jpeg(), { credit: "   " });
    expect(f1.has("credit")).toBe(false);
    expect(f1.get("make_cover")).toBe("false");
    expect((buildPhotoForm(jpeg(), { credit: "x".repeat(400) }).get("credit") as string).length).toBe(160);
  });

  it("validation locale : taille et type", () => {
    expect(validatePhotoFile({ size: MAX_PHOTO_BYTES + 1, type: "image/jpeg" })).toBe(PHOTO_ERRORS.file_too_large);
    expect(validatePhotoFile({ size: 10, type: "image/gif" })).toBe(PHOTO_ERRORS.invalid_image);
    expect(validatePhotoFile({ size: 10, type: "image/webp" })).toBeNull();
  });
});

describe("envoi", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    setToken(null);
  });

  it("POST multipart avec le jeton, sans Content-Type JSON", async () => {
    setToken("jwt-curateur");
    const fetchMock = mockFetch(201, { id: "m1", url: "http://api/media/a.jpg", is_cover: true });
    const res = await uploadPlacePhoto("place-1", jpeg(), { makeCover: true, credit: "Photo : Awa" });
    expect(res).toEqual({ id: "m1", url: "http://api/media/a.jpg", is_cover: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/admin\/places\/place-1\/photos$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer jwt-curateur");
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("make_cover")).toBe("true");
    expect((init.body as FormData).get("credit")).toBe("Photo : Awa");
  });

  it("fichier trop lourd ou non pris en charge : aucune requête", async () => {
    const fetchMock = mockFetch(201, {});
    await expect(uploadPlacePhoto("p", jpeg(MAX_PHOTO_BYTES + 1))).rejects.toMatchObject({ code: "file_too_large" });
    await expect(uploadPlacePhoto("p", jpeg(10, "a.gif", "image/gif"))).rejects.toMatchObject({ code: "invalid_image" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("erreurs serveur traduites", async () => {
    mockFetch(400, { detail: "Image illisible", code: "invalid_image" });
    expect(photoErrorMessage(await uploadPlacePhoto("p", jpeg()).catch((e: unknown) => e))).toBe(PHOTO_ERRORS.invalid_image);
    mockFetch(413, { detail: "Trop lourd", code: "file_too_large" });
    expect(photoErrorMessage(await uploadPlacePhoto("p", jpeg()).catch((e: unknown) => e))).toBe(PHOTO_ERRORS.file_too_large);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(photoErrorMessage(await uploadPlacePhoto("p", jpeg()).catch((e: unknown) => e))).toBe(PHOTO_ERRORS.network);
    expect(photoErrorMessage(new ApiError(403, "forbidden", "Accès refusé"))).toBe(PHOTO_ERRORS.forbidden);
  });

  it("couverture et suppression", async () => {
    const fetchMock = mockFetch(200, { id: "m1", is_cover: true });
    await api.admin.setCover("m1");
    expect(fetchMock.mock.calls[0]![1].method).toBe("PATCH");
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/admin\/photos\/m1\/cover$/);
    const del = mockFetch(204, undefined);
    await expect(api.admin.deletePhoto("m1")).resolves.toBeUndefined();
    expect(del.mock.calls[0]![1].method).toBe("DELETE");
  });
});

describe("rôles et crédits", () => {
  it("seuls curateurs et admins gèrent les photos", () => {
    expect(canManagePhotos({ role: "curator" })).toBe(true);
    expect(canManagePhotos({ role: "admin" })).toBe(true);
    expect(canManagePhotos({ role: "user" })).toBe(false);
    expect(canManagePhotos(null)).toBe(false);
  });

  it("crédits et couverture", () => {
    expect(creditLabel("ATV · CC BY-SA 4.0 · Wikimedia Commons")).toBe("© ATV · CC BY-SA 4.0 · Wikimedia Commons");
    expect(creditLabel("Photo : Awa")).toBe("Photo : Awa");
    expect(creditLabel(null)).toBeNull();
    expect(isCoverPhoto({ url: "a" }, { url: "a" })).toBe(true);
    expect(isCoverPhoto({ url: "a" }, { url: null })).toBe(false);
  });
});
