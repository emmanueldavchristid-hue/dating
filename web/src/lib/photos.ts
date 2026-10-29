import { ApiError, api, errorMessage } from "./api";
import type { Cover, PlacePhoto, Role, UploadedPhoto } from "./types";

/** Limite du serveur : 8 Mo, JPEG / PNG / WebP. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_CREDIT_LENGTH = 160;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Seuls les curateurs et administrateurs gèrent les photos. */
export function canManagePhotos(user: { role: Role } | null | undefined): boolean {
  return user?.role === "curator" || user?.role === "admin";
}

export const PHOTO_ERRORS = {
  invalid_image: "Ce fichier n'est pas une image lisible. Utilisez une photo JPEG, PNG ou WebP.",
  file_too_large: "Photo trop lourde : 8 Mo maximum.",
  network: "Envoi interrompu : vérifiez votre connexion puis réessayez.",
  forbidden: "Seuls les curateurs et administrateurs peuvent gérer les photos.",
  auth: "Session expirée : reconnectez-vous pour continuer.",
  not_found: "Cette photo ou ce lieu n'existe plus.",
} as const;

/** Vérifications avant l'envoi (évite un transfert inutile). */
export function validatePhotoFile(file: Pick<File, "size" | "type">): string | null {
  if (file.size > MAX_PHOTO_BYTES) return PHOTO_ERRORS.file_too_large;
  if (file.type && !ACCEPTED_TYPES.includes(file.type.toLowerCase())) return PHOTO_ERRORS.invalid_image;
  return null;
}

/** Corps multipart de `POST /admin/places/{id}/photos`. */
export function buildPhotoForm(file: Blob, { credit, makeCover = false, name }: { credit?: string | null; makeCover?: boolean; name?: string } = {}): FormData {
  const form = new FormData();
  const fileName = name ?? (file instanceof File ? file.name : "photo.jpg");
  form.append("file", file, fileName);
  const c = credit?.trim().slice(0, MAX_CREDIT_LENGTH);
  if (c) form.append("credit", c);
  form.append("make_cover", makeCover ? "true" : "false");
  return form;
}

/** Vérifie puis envoie la photo. */
export async function uploadPlacePhoto(placeId: string, file: File, opts: { credit?: string | null; makeCover?: boolean } = {}): Promise<UploadedPhoto> {
  const invalid = validatePhotoFile(file);
  if (invalid) {
    throw invalid === PHOTO_ERRORS.file_too_large ? new ApiError(413, "file_too_large", invalid) : new ApiError(400, "invalid_image", invalid);
  }
  return api.admin.uploadPhoto(placeId, buildPhotoForm(file, opts));
}

/** Message clair pour chaque échec d'envoi ou de gestion de photo. */
export function photoErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_image") return PHOTO_ERRORS.invalid_image;
    if (err.code === "file_too_large" || err.status === 413) return PHOTO_ERRORS.file_too_large;
    if (err.kind === "network") return PHOTO_ERRORS.network;
    if (err.kind === "auth") return PHOTO_ERRORS.auth;
    if (err.kind === "forbidden") return PHOTO_ERRORS.forbidden;
    if (err.kind === "not_found") return PHOTO_ERRORS.not_found;
  }
  return errorMessage(err);
}

export function realPhotos(photos: PlacePhoto[] | null | undefined): PlacePhoto[] {
  return (photos ?? []).filter((p) => !!p.url);
}

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
