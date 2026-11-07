import { render, screen } from "@testing-library/react-native";
import { PhotoCredit, PlaceGallery } from "@/components/PlacePhotos";
import { ApiError, setToken } from "@/lib/api";
import {
  buildPhotoForm,
  canManagePhotos,
  checkPhotoSize,
  creditLabel,
  MAX_PHOTO_BYTES,
  photoErrorMessage,
  photoFileName,
  photoMimeType,
  PHOTO_ERRORS,
  toUploadFile,
  uploadPlacePhoto,
} from "@/lib/photos";
import type { Cover, PlacePhoto } from "@/lib/types";

jest.mock("@/lib/storage", () => ({ readSecure: jest.fn(async () => null), writeSecure: jest.fn(async () => {}) }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

// Le FormData de React Native (celui du téléphone), pas celui de Node : il accepte {uri, name, type}.
// eslint-disable-next-line @typescript-eslint/no-require-imports
global.FormData = require("react-native/Libraries/Network/FormData").default;

type Part = { fieldName: string; string?: string; uri?: string; name?: string; type?: string };
const parts = (form: FormData): Part[] => (form as unknown as { getParts: () => Part[] }).getParts();
const field = (form: FormData, name: string) => parts(form).find((p) => p.fieldName === name);

function mockFetch(status: number, body: unknown) {
  global.fetch = jest.fn(async () => ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

describe("préparation du fichier", () => {
  it("type MIME : déclaré, sinon déduit de l'extension, JPEG par défaut", () => {
    expect(photoMimeType({ uri: "file:///a.jpg", mimeType: "image/jpg" })).toBe("image/jpeg");
    expect(photoMimeType({ uri: "file:///a.PNG" })).toBe("image/png");
    expect(photoMimeType({ uri: "file:///x", fileName: "IMG_1.webp" })).toBe("image/webp");
    expect(photoMimeType({ uri: "file:///cache/ABC" })).toBe("image/jpeg");
  });

  it("nom de fichier nettoyé, extension cohérente avec le type", () => {
    expect(photoFileName({ uri: "file:///a", fileName: "Été à Assinie.JPG" })).toBe("Ete-a-Assinie.jpg");
    expect(photoFileName({ uri: "file:///b.png" }, 42)).toBe("photo-42.png");
  });

  it("natif : objet {uri, name, type}", async () => {
    await expect(toUploadFile({ uri: "file:///tmp/p.jpg", fileName: "p.jpg", mimeType: "image/jpeg" }, "android")).resolves.toEqual({
      uri: "file:///tmp/p.jpg",
      name: "p.jpg",
      type: "image/jpeg",
    });
  });

  it("multipart : fichier, crédit nettoyé, make_cover", () => {
    const form = buildPhotoForm({ uri: "file:///p.jpg", name: "p.jpg", type: "image/jpeg" }, "p.jpg", { credit: "  Awa K.  ", makeCover: true });
    expect(field(form, "file")).toMatchObject({ uri: "file:///p.jpg", name: "p.jpg", type: "image/jpeg" });
    expect(field(form, "credit")?.string).toBe("Awa K.");
    expect(field(form, "make_cover")?.string).toBe("true");
  });

  it("crédit vide omis, make_cover=false par défaut, crédit tronqué à 160", () => {
    const f1 = buildPhotoForm({ uri: "file:///p.jpg", name: "p.jpg", type: "image/jpeg" }, "p.jpg", { credit: "   " });
    expect(field(f1, "credit")).toBeUndefined();
    expect(field(f1, "make_cover")?.string).toBe("false");
    const f2 = buildPhotoForm({ uri: "file:///p.jpg", name: "p.jpg", type: "image/jpeg" }, "p.jpg", { credit: "x".repeat(300) });
    expect(field(f2, "credit")?.string).toHaveLength(160);
  });

  it("refuse avant l'envoi une photo de plus de 8 Mo", () => {
    expect(() => checkPhotoSize({ fileSize: MAX_PHOTO_BYTES + 1 })).toThrow(PHOTO_ERRORS.file_too_large);
    expect(() => checkPhotoSize({ fileSize: MAX_PHOTO_BYTES })).not.toThrow();
    expect(() => checkPhotoSize({})).not.toThrow();
  });
});

describe("envoi", () => {
  afterEach(async () => setToken(null));

  it("POST multipart avec le jeton, sans Content-Type JSON", async () => {
    await setToken("jwt-curateur");
    mockFetch(201, { id: "m1", url: "http://api/media/x.jpg", is_cover: true });
    const res = await uploadPlacePhoto("place-1", { uri: "file:///p.jpg", mimeType: "image/jpeg", fileSize: 1000 }, { makeCover: true }, undefined, "ios");
    expect(res).toEqual({ id: "m1", url: "http://api/media/x.jpg", is_cover: true });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/admin\/places\/place-1\/photos$/);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer jwt-curateur");
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    expect(field(init.body, "make_cover")?.string).toBe("true");
  });

  it("photo trop lourde : aucune requête", async () => {
    mockFetch(201, {});
    await expect(uploadPlacePhoto("p", { uri: "file:///p.jpg", fileSize: MAX_PHOTO_BYTES * 2 }, {}, undefined, "ios")).rejects.toMatchObject({ code: "file_too_large" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("erreurs serveur traduites", async () => {
    mockFetch(400, { detail: "Image illisible", code: "invalid_image" });
    const e1 = await uploadPlacePhoto("p", { uri: "file:///p.jpg" }, {}, undefined, "ios").catch((e: unknown) => e);
    expect(photoErrorMessage(e1)).toBe(PHOTO_ERRORS.invalid_image);
    mockFetch(413, { detail: "Trop lourd", code: "file_too_large" });
    const e2 = await uploadPlacePhoto("p", { uri: "file:///p.jpg" }, {}, undefined, "ios").catch((e: unknown) => e);
    expect(photoErrorMessage(e2)).toBe(PHOTO_ERRORS.file_too_large);
    global.fetch = jest.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const e3 = await uploadPlacePhoto("p", { uri: "file:///p.jpg" }, {}, undefined, "ios").catch((e: unknown) => e);
    expect(photoErrorMessage(e3)).toBe(PHOTO_ERRORS.network);
    expect(photoErrorMessage(new ApiError(403, "forbidden", "Accès refusé"))).toBe(PHOTO_ERRORS.forbidden);
    expect(photoErrorMessage(new ApiError(413, "http_413", ""))).toBe(PHOTO_ERRORS.file_too_large);
  });
});

describe("rôles et crédits", () => {
  it("seuls curateurs et admins gèrent les photos", () => {
    expect(canManagePhotos({ role: "curator" })).toBe(true);
    expect(canManagePhotos({ role: "admin" })).toBe(true);
    expect(canManagePhotos({ role: "user" })).toBe(false);
    expect(canManagePhotos(null)).toBe(false);
  });

  it("libellé de crédit", () => {
    expect(creditLabel("ATV · CC BY-SA 4.0 · Wikimedia Commons")).toBe("© ATV · CC BY-SA 4.0 · Wikimedia Commons");
    expect(creditLabel("Photo : Awa")).toBe("Photo : Awa");
    expect(creditLabel("  ")).toBeNull();
  });

  const cover: Cover = { url: "https://upload.wikimedia.org/a.jpg", gradient: ["#000", "#111"], alt: "a" };
  const photos: PlacePhoto[] = [
    { id: "m1", url: "https://upload.wikimedia.org/a.jpg", gradient: ["#000", "#111"], alt: "Photo A", credit: "ATV · CC BY-SA 4.0 · Wikimedia Commons" },
    { id: "m2", url: "http://localhost:8000/media/b.jpg", gradient: ["#000", "#111"], alt: "Photo B", credit: "Photo : Awa" },
  ];

  it("membre : ni ajout ni menu ; crédits visibles", async () => {
    await render(<PlaceGallery photos={photos} cover={cover} user={{ role: "user" }} />);
    expect(screen.getAllByTestId("gallery-photo")).toHaveLength(2);
    expect(screen.queryByTestId("add-photo")).toBeNull();
    expect(screen.queryByTestId("photo-menu")).toBeNull();
    expect(screen.queryByText("Ajouter une photo")).toBeNull();
    expect(screen.getByText("© ATV · CC BY-SA 4.0 · Wikimedia Commons")).toBeTruthy();
  });

  it("visiteur non connecté avec une seule photo : pas de galerie", async () => {
    await render(<PlaceGallery photos={photos.slice(0, 1)} cover={cover} user={null} />);
    expect(screen.queryByTestId("place-gallery")).toBeNull();
  });

  it.each(["curator", "admin"] as const)("%s : bouton « Ajouter une photo » et menu par photo", async (role) => {
    const onAdd = jest.fn();
    await render(<PlaceGallery photos={[]} cover={{ ...cover, url: null }} user={{ role }} onAdd={onAdd} />);
    expect(screen.getByTestId("add-photo")).toBeTruthy();
    expect(screen.getByText("Ajouter une photo")).toBeTruthy();
    await render(<PlaceGallery photos={photos} cover={cover} user={{ role }} />);
    expect(screen.getAllByTestId("photo-menu")).toHaveLength(2);
    expect(screen.getByText("Couverture")).toBeTruthy();
  });

  it("crédit du héros", async () => {
    await render(<PhotoCredit credit="ATV · CC BY-SA 4.0 · Wikimedia Commons" />);
    expect(screen.getByTestId("photo-credit")).toBeTruthy();
    await render(<PhotoCredit credit={null} />);
    expect(screen.queryByTestId("photo-credit")).toBeNull();
  });
});

describe("progression d'envoi (XMLHttpRequest)", () => {
  const realXhr = global.XMLHttpRequest;
  afterEach(() => {
    global.XMLHttpRequest = realXhr;
  });

  function fakeXhr(status: number, body: unknown) {
    const sent: { headers: Record<string, string>; url?: string; body?: unknown } = { headers: {} };
    class FakeXhr {
      status = 0;
      responseText = "";
      timeout = 0;
      upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      open(_m: string, url: string) {
        sent.url = url;
      }
      setRequestHeader(k: string, v: string) {
        sent.headers[k] = v;
      }
      send(b: unknown) {
        sent.body = b;
        this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
        this.status = status;
        this.responseText = JSON.stringify(body);
        this.onload?.();
      }
    }
    global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
    return sent;
  }

  it("remonte la progression puis la réponse", async () => {
    await setToken("jwt");
    const sent = fakeXhr(201, { id: "m9", url: "u", is_cover: false });
    const seen: number[] = [];
    const res = await uploadPlacePhoto("p1", { uri: "file:///p.jpg" }, {}, (r) => seen.push(r), "android");
    expect(res.id).toBe("m9");
    expect(seen).toEqual([0.5, 1]);
    expect(sent.headers.Authorization).toBe("Bearer jwt");
    expect(sent.url).toMatch(/\/admin\/places\/p1\/photos$/);
    await setToken(null);
  });

  it("erreur {detail, code} conservée", async () => {
    fakeXhr(400, { detail: "Image illisible", code: "invalid_image" });
    const e = await uploadPlacePhoto("p1", { uri: "file:///p.jpg" }, {}, () => undefined, "android").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(photoErrorMessage(e)).toBe(PHOTO_ERRORS.invalid_image);
  });
});
