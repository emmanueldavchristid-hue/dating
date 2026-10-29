import { Platform } from "react-native";
import { api, ApiError, DEFAULT_MESSAGES, errorMessage, type UploadedPhoto } from "./api";
import type { Cover, PlacePhoto, User } from "./types";

/** Limite du serveur (8 Mo) : vérifiée avant l'envoi pour éviter un transfert inutile. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_CREDIT_LENGTH = 160;

/** Options de sélection : JPEG compressé, pas de recadrage (photo telle que prise). */
export const PICKER_QUALITY = 0.85;

/** Seuls les curateurs et administrateurs gèrent les photos d'une fiche. */
export function canManagePhotos(user: Pick<User, "role"> | null | undefined): boolean {
  return user?.role === "curator" || user?.role === "admin";
}

/** Sous-ensemble d'un `ImagePickerAsset` utile à l'envoi. */
export interface PickedImage {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  /** Web uniquement : le `File` choisi. */
  file?: Blob | null;
}

/** Fichier multipart à la manière de React Native (Android / iOS). */
export interface NativeFile {
  uri: string;
  name: string;
  type: string;
}

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

function extOf(s: string | null | undefined): string | null {
  if (!s || s.startsWith("data:")) return null;
  const m = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(s);
  return m ? m[1]!.toLowerCase() : null;
}

/** Type MIME de l'image (JPEG par défaut : c'est ce que produit le sélecteur). */
export function photoMimeType(img: Pick<PickedImage, "uri" | "fileName" | "mimeType">): string {
  const declared = img.mimeType?.toLowerCase().trim();
  if (declared === "image/jpg") return "image/jpeg";
  if (declared && declared.startsWith("image/")) return declared;
  const ext = extOf(img.fileName) ?? extOf(img.uri);
  return (ext && EXT_MIME[ext]) || "image/jpeg";
}

/** Nom de fichier propre (le serveur ne s'en sert pas, mais le multipart l'exige). */
export function photoFileName(img: Pick<PickedImage, "uri" | "fileName" | "mimeType">, now = Date.now()): string {
  const type = photoMimeType(img);
  const ext = MIME_EXT[type] ?? "jpg";
  const raw = (img.fileName ?? "").split(/[\\/]/).pop() ?? "";
  const base = raw
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || `photo-${now}`}.${ext}`;
}

/** Erreur « trop lourde » levée côté client, identique à celle du serveur. */
export function checkPhotoSize(img: Pick<PickedImage, "fileSize" | "file">): void {
  const size = img.fileSize ?? (img.file && typeof img.file.size === "number" ? img.file.size : null);
  if (size != null && size > MAX_PHOTO_BYTES) {
    throw new ApiError(413, "file_too_large", PHOTO_ERRORS.file_too_large);
  }
}

/**
 * Fichier à joindre : `{uri, name, type}` sur Android / iOS, `Blob` (le `File` choisi) sur le web.
 * Sur le web sans `File`, l'URI (blob: ou data:) est relue.
 */
export async function toUploadFile(img: PickedImage, platform: string = Platform.OS): Promise<NativeFile | Blob> {
  if (platform !== "web") return { uri: img.uri, name: photoFileName(img), type: photoMimeType(img) };
  if (img.file) return img.file;
  const res = await fetch(img.uri);
  return res.blob();
}

export interface PhotoOptions {
  credit?: string | null;
  makeCover?: boolean;
}

/** Corps multipart attendu par `POST /admin/places/{id}/photos`. */
export function buildPhotoForm(file: NativeFile | Blob, name: string, { credit, makeCover = false }: PhotoOptions = {}): FormData {
  const form = new FormData();
  if (typeof Blob !== "undefined" && file instanceof Blob) form.append("file", file, name);
  // React Native accepte un objet {uri, name, type} comme partie fichier.
  else form.append("file", file as unknown as Blob);
  const c = credit?.trim().slice(0, MAX_CREDIT_LENGTH);
  if (c) form.append("credit", c);
  form.append("make_cover", makeCover ? "true" : "false");
  return form;
}

/** Vérifie, prépare et envoie la photo. */
export async function uploadPlacePhoto(
  placeId: string,
  img: PickedImage,
  opts: PhotoOptions = {},
  onProgress?: (ratio: number) => void,
  platform: string = Platform.OS,
): Promise<UploadedPhoto> {
  checkPhotoSize(img);
  const file = await toUploadFile(img, platform);
  checkPhotoSize({ file: typeof Blob !== "undefined" && file instanceof Blob ? file : null });
  return api.photos.upload(placeId, buildPhotoForm(file, photoFileName(img), opts), onProgress);
}

export const PHOTO_ERRORS = {
  invalid_image: "Ce fichier n'est pas une image lisible. Utilise une photo JPEG, PNG ou WebP.",
  file_too_large: "Photo trop lourde : 8 Mo maximum. Choisis une image plus légère.",
  network: "Envoi interrompu : vérifie ta connexion puis réessaie.",
  forbidden: "Seuls les curateurs et administrateurs peuvent gérer les photos.",
  auth: "Ta session a expiré : reconnecte-toi pour envoyer la photo.",
  not_found: "Cette photo ou ce lieu n'existe plus.",
} as const;

/** Message clair pour chaque échec d'envoi ou de gestion de photo. */
export function photoErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_image") return PHOTO_ERRORS.invalid_image;
    if (err.code === "file_too_large" || err.status === 413) return PHOTO_ERRORS.file_too_large;
    if (err.kind === "network") return PHOTO_ERRORS.network;
    if (err.kind === "auth") return PHOTO_ERRORS.auth;
    if (err.kind === "forbidden") return PHOTO_ERRORS.forbidden;
    if (err.kind === "not_found") return PHOTO_ERRORS.not_found;
    if (err.kind === "validation" && !err.detail) return DEFAULT_MESSAGES.validation;
  }
  return errorMessage(err);
}

/** Photos réellement affichables (avec une image). */
export function realPhotos(photos: PlacePhoto[] | null | undefined): PlacePhoto[] {
  return (photos ?? []).filter((p) => !!p.url);
}

/** La photo de couverture, si elle figure dans la galerie. */
export function isCoverPhoto(photo: Pick<PlacePhoto, "url">, cover: Pick<Cover, "url"> | null | undefined): boolean {
  return !!photo.url && !!cover?.url && photo.url === cover.url;
}

/** Crédit affichable : « © Auteur · Licence » ; les crédits « Photo : … » restent tels quels. */
export function creditLabel(credit: string | null | undefined): string | null {
  const c = credit?.trim();
  if (!c) return null;
  if (/^(©|\(c\)|photo\b)/i.test(c)) return c;
  return `© ${c}`;
}
