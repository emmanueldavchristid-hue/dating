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

/** Provenance d'une photo réelle (seules sources acceptées à l'envoi). */
export type PhotoSource = "team" | "owner" | "licensed";

export const PHOTO_SOURCES: { value: PhotoSource; label: string; hint: string }[] = [
  { value: "team", label: "Prise par l'équipe", hint: "Photo prise sur place par vous ou l'équipe." },
  { value: "owner", label: "Fournie par le lieu", hint: "Le gérant a envoyé la photo et donné son accord." },
  { value: "licensed", label: "Autre, avec autorisation ou licence", hint: "Photographe, agence, licence libre : accord ou licence à préciser." },
];

export interface PhotoOptions {
  source?: PhotoSource;
  author?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourcePage?: string | null;
  rightsNote?: string | null;
  rightsConfirmed?: boolean;
  makeCover?: boolean;
  name?: string;
}

/** Ce qui manque avant l'envoi (mêmes règles que le serveur), ou null. */
export function missingRights({ source = "team", author, rightsNote, rightsConfirmed }: PhotoOptions): string | null {
  if (!author?.trim()) return "Indiquez l'auteur de la photo.";
  if (source !== "team" && !rightsNote?.trim()) return "Précisez l'autorisation obtenue (qui, comment, quand).";
  if (!rightsConfirmed) return "Confirmez que vous avez le droit d'utiliser cette photo.";
  return null;
}

/** Corps multipart de `POST /admin/places/{id}/photos`. */
export function buildPhotoForm(file: Blob, opts: PhotoOptions = {}): FormData {
  const { source = "team", author, license, licenseUrl, sourcePage, rightsNote, rightsConfirmed = false, makeCover = false, name } = opts;
  const form = new FormData();
  const fileName = name ?? (file instanceof File ? file.name : "photo.jpg");
  form.append("file", file, fileName);
  form.append("source_kind", source);
  const put = (key: string, v: string | null | undefined, max: number) => {
    const t = v?.trim().slice(0, max);
    if (t) form.append(key, t);
  };
  put("author", author, MAX_CREDIT_LENGTH);
  put("license", license, 80);
  put("license_url", licenseUrl, 300);
  put("source_page", sourcePage, 500);
  put("rights_note", rightsNote, 300);
  form.append("rights_confirmed", rightsConfirmed ? "true" : "false");
  form.append("make_cover", makeCover ? "true" : "false");
  return form;
}

/** Vérifie puis envoie la photo. */
export async function uploadPlacePhoto(placeId: string, file: File, opts: PhotoOptions = {}): Promise<UploadedPhoto> {
  const invalid = validatePhotoFile(file);
  if (invalid) {
    throw invalid === PHOTO_ERRORS.file_too_large ? new ApiError(413, "file_too_large", invalid) : new ApiError(400, "invalid_image", invalid);
  }
  const missing = missingRights(opts);
  if (missing) throw new ApiError(422, "rights_required", missing);
  return api.admin.uploadPhoto(placeId, buildPhotoForm(file, opts));
}

/** Message clair pour chaque échec d'envoi ou de gestion de photo. */
export function photoErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "invalid_image") return PHOTO_ERRORS.invalid_image;
    if (err.code === "rights_required") return err.message;
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
