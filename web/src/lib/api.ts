import { API_URL, STORAGE_KEYS } from "./config";
import { readStorage, writeStorage } from "./storage";
import type {
  AdminPlace,
  AdminPlaceInput,
  AdminReport,
  AdminStats,
  AdminUser,
  Ambiance,
  AuditEntry,
  AuthResponse,
  BillingPlan,
  Capabilities,
  Category,
  City,
  CityRaw,
  CollectionDetail,
  CollectionSummary,
  ConciergeResponse,
  CurationItem,
  HomeResponse,
  Itinerary,
  ItineraryStepInput,
  ItinerarySummary,
  Paginated,
  PlaceCard,
  PlaceDetail,
  Plan,
  Preferences,
  ReportKind,
  ReportStatus,
  Role,
  SearchResponse,
  UploadedPhoto,
  Subscription,
  SuggestRequest,
  SuggestResponse,
  User,
} from "./types";

/** Catégorie d'erreur exploitable par l'UI. */
export type ApiErrorKind =
  | "auth" // 401 → inviter à se connecter
  | "premium" // 403 premium_required → upsell
  | "forbidden" // 403 forbidden
  | "quota" // 429 quota_exceeded
  | "rate_limited" // 429 rate_limited
  | "not_configured" // 501 → « bientôt disponible »
  | "not_found"
  | "conflict"
  | "validation"
  | "network"
  | "server";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly kind: ApiErrorKind;

  constructor(status: number, code: string, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.kind = classifyError(status, code);
  }
}

export function classifyError(status: number, code: string): ApiErrorKind {
  if (status === 0 || code === "network_error") return "network";
  if (code === "premium_required") return "premium";
  if (code === "quota_exceeded") return "quota";
  if (code === "not_configured" || status === 501) return "not_configured";
  if (status === 401) return "auth";
  if (code === "rate_limited") return "rate_limited";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  return "server";
}

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  auth: "Connectez-vous pour continuer.",
  premium: "Cette fonctionnalité fait partie d'une offre premium.",
  forbidden: "Vous n'avez pas accès à cette ressource.",
  quota: "Vous avez atteint votre quota pour aujourd'hui.",
  rate_limited: "Trop de requêtes. Réessayez dans un instant.",
  not_configured: "Bientôt disponible.",
  not_found: "Introuvable.",
  conflict: "Cette ressource existe déjà.",
  validation: "Certaines informations sont invalides.",
  network: "Impossible de joindre le serveur. Vérifiez votre connexion.",
  server: "Une erreur est survenue. Réessayez plus tard.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || DEFAULT_MESSAGES[err.kind];
  if (err instanceof Error) return err.message;
  return DEFAULT_MESSAGES.server;
}

/** Normalise le corps d'erreur ({detail, code}, ou détail FastAPI 422 en tableau). */
export function parseErrorBody(status: number, body: unknown): ApiError {
  let detail = "";
  let code = "";
  if (body && typeof body === "object") {
    const b = body as { detail?: unknown; code?: unknown };
    if (typeof b.code === "string") code = b.code;
    if (typeof b.detail === "string") detail = b.detail;
    else if (Array.isArray(b.detail)) {
      detail = b.detail
        .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : ""))
        .filter(Boolean)
        .join(" · ");
      if (!code) code = "validation_error";
    }
  }
  if (!code) code = status === 401 ? "unauthorized" : `http_${status}`;
  const err = new ApiError(status, code, detail);
  if (!detail) {
    return new ApiError(status, code, DEFAULT_MESSAGES[err.kind]);
  }
  return err;
}

// ---------------------------------------------------------------------------
// Jeton

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}
export function getToken(): string | null {
  return readStorage(STORAGE_KEYS.token);
}
export function setToken(token: string | null): void {
  writeStorage(STORAGE_KEYS.token, token);
}

// ---------------------------------------------------------------------------
// Requêtes

export type QueryValue = string | number | boolean | null | undefined | string[];
export type Query = Record<string, QueryValue>;

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","));
      continue;
    }
    if (value === false) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Par défaut true : joint le jeton s'il existe. */
  auth?: boolean;
}

/** Corps multipart : le navigateur fixe lui-même l'en-tête (avec la frontière). */
export function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, signal, auth = true } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  const multipart = isFormData(body);
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "network_error", DEFAULT_MESSAGES.network);
  }

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = parseErrorBody(res.status, data);
    if (err.status === 401 && token && unauthorizedHandler) unauthorizedHandler();
    throw err;
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Points d'entrée

type Origin = { lat?: number; lng?: number; city?: string };

export const api = {
  health: () => request<{ status: string; db: string }>("/health", { auth: false }),

  meta: {
    categories: () => request<Category[]>("/meta/categories", { auth: false }),
    ambiances: () => request<Ambiance[]>("/meta/ambiances", { auth: false }),
    cities: () => request<CityRaw[]>("/meta/cities", { auth: false }).then((list) => list.map(normalizeCity)),
    capabilities: () => request<Capabilities>("/meta/capabilities", { auth: false }),
  },

  places: {
    search: (query: Query, signal?: AbortSignal) =>
      request<SearchResponse>("/places/search", { query, signal }),
    get: (idOrSlug: string, origin?: { lat: number; lng: number } | null) =>
      request<PlaceDetail>(`/places/${encodeURIComponent(idOrSlug)}`, {
        query: origin ? { lat: origin.lat, lng: origin.lng } : undefined,
      }),
    gems: (city?: string) => request<PlaceCard[]>("/places/gems", { query: { city } }),
    report: (id: string, kind: ReportKind, message: string) =>
      request<unknown>(`/places/${encodeURIComponent(id)}/reports`, {
        method: "POST",
        body: { kind, message },
      }),
    review: (id: string, rating: number, text: string) =>
      request<unknown>(`/places/${encodeURIComponent(id)}/reviews`, {
        method: "POST",
        body: { rating, text },
      }),
  },

  recommendations: {
    home: (origin: Origin, signal?: AbortSignal) =>
      request<HomeResponse>("/recommendations/home", { query: origin, signal }),
  },

  auth: {
    register: (email: string, password: string, display_name: string) =>
      request<AuthResponse>("/auth/register", {
        method: "POST",
        body: { email, password, display_name },
        auth: false,
      }),
    login: (email: string, password: string) =>
      request<AuthResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  },

  me: {
    get: () => request<User>("/me"),
    updatePreferences: (prefs: Partial<Preferences>) =>
      request<User>("/me/preferences", { method: "PATCH", body: prefs }),
    consent: (location: boolean) => request<User>("/me/consent", { method: "POST", body: { location } }),
    export: () => request<unknown>("/me/export"),
    remove: () => request<void>("/me", { method: "DELETE" }),
    subscription: () => request<Subscription>("/me/subscription"),
  },

  favorites: {
    list: () => request<PlaceCard[]>("/me/favorites"),
    add: (placeId: string) =>
      request<void>(`/me/favorites/${encodeURIComponent(placeId)}`, { method: "PUT" }),
    remove: (placeId: string) =>
      request<void>(`/me/favorites/${encodeURIComponent(placeId)}`, { method: "DELETE" }),
  },

  collections: {
    list: () => request<CollectionSummary[]>("/me/collections"),
    create: (name: string, description?: string) =>
      request<CollectionSummary>("/me/collections", {
        method: "POST",
        body: description ? { name, description } : { name },
      }),
    get: (id: string) => request<CollectionDetail>(`/me/collections/${encodeURIComponent(id)}`),
    remove: (id: string) =>
      request<void>(`/me/collections/${encodeURIComponent(id)}`, { method: "DELETE" }),
    addItem: (id: string, placeId: string) =>
      request<unknown>(`/me/collections/${encodeURIComponent(id)}/items`, {
        method: "POST",
        body: { place_id: placeId },
      }),
    removeItem: (id: string, placeId: string) =>
      request<void>(
        `/me/collections/${encodeURIComponent(id)}/items/${encodeURIComponent(placeId)}`,
        { method: "DELETE" },
      ),
  },

  itineraries: {
    suggest: (body: SuggestRequest) =>
      request<SuggestResponse>("/itineraries/suggest", { method: "POST", body }),
    list: () => request<ItinerarySummary[]>("/me/itineraries"),
    create: (title: string, steps: ItineraryStepInput[], date?: string) =>
      request<Itinerary>("/me/itineraries", {
        method: "POST",
        body: date ? { title, date, steps } : { title, steps },
      }),
    get: (id: string) => request<Itinerary>(`/me/itineraries/${encodeURIComponent(id)}`),
    remove: (id: string) =>
      request<void>(`/me/itineraries/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  concierge: (message: string, origin: Origin) =>
    request<ConciergeResponse>("/concierge", { method: "POST", body: { message, ...origin } }),

  billing: {
    plans: () => request<BillingPlan[]>("/billing/plans", { auth: false }),
    checkout: (plan: Plan) => request<unknown>("/billing/checkout", { method: "POST", body: { plan } }),
  },

  admin: {
    stats: () => request<AdminStats>("/admin/stats"),
    places: (q: string, page: number) =>
      request<Paginated<AdminPlace>>("/admin/places", { query: { q, page } }),
    createPlace: (body: AdminPlaceInput) =>
      request<AdminPlace>("/admin/places", { method: "POST", body }),
    updatePlace: (id: string, body: Partial<AdminPlaceInput>) =>
      request<AdminPlace>(`/admin/places/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    users: (q: string, page: number) =>
      request<Paginated<AdminUser>>("/admin/users", { query: { q, page } }),
    updateUser: (id: string, body: { role?: Role; plan?: Plan }) =>
      request<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    reports: (status: ReportStatus) =>
      request<Paginated<AdminReport> | AdminReport[]>("/admin/reports", { query: { status } }),
    updateReport: (id: string, status: ReportStatus) =>
      request<AdminReport>(`/admin/reports/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }),
    curation: () => request<Paginated<CurationItem> | CurationItem[]>("/admin/curation"),
    decide: (id: string, decision: "approved" | "rejected", note?: string) =>
      request<unknown>(`/admin/curation/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: note ? { decision, note } : { decision },
      }),
    audit: (page: number) => request<Paginated<AuditEntry>>("/admin/audit", { query: { page } }),
    /** Photos : curateurs et administrateurs. */
    uploadPhoto: (placeId: string, form: FormData) =>
      request<UploadedPhoto>(`/admin/places/${encodeURIComponent(placeId)}/photos`, { method: "POST", body: form }),
    setCover: (mediaId: string) =>
      request<{ id: string; is_cover: boolean }>(`/admin/photos/${encodeURIComponent(mediaId)}/cover`, { method: "PATCH" }),
    deletePhoto: (mediaId: string) => request<void>(`/admin/photos/${encodeURIComponent(mediaId)}`, { method: "DELETE" }),
  },
};

/** Accepte une liste paginée ou un tableau brut (forme non figée par le contrat). */
export function itemsOf<T>(data: Paginated<T> | T[] | null | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.items ?? [];
}

function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCity(c: CityRaw): City {
  return {
    ...c,
    districts: (c.districts ?? []).map((d) => (typeof d === "string" ? { slug: slugifyName(d), name: d } : d)),
  };
}
