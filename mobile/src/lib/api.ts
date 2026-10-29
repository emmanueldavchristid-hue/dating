import { API_URL, STORAGE_KEYS } from "./config";
import { readSecure, writeSecure } from "./storage";
import type {
  Ambiance,
  AuthResponse,
  BillingPlan,
  Capabilities,
  Category,
  ChatTurn,
  City,
  CityRaw,
  CollectionDetail,
  CollectionSummary,
  ConciergeResponse,
  EventType,
  HomeResponse,
  Itinerary,
  ItineraryStepInput,
  ItinerarySummary,
  PlaceCard,
  PlaceDetail,
  Plan,
  Preferences,
  ReportKind,
  SearchResponse,
  Subscription,
  SuggestRequest,
  SuggestResponse,
  Taste,
  User,
} from "./types";

/** Catégorie d'erreur exploitable par l'UI. */
export type ApiErrorKind =
  | "auth"
  | "premium"
  | "forbidden"
  | "quota"
  | "rate_limited"
  | "not_configured"
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

export const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  auth: "Connecte-toi pour continuer.",
  premium: "Cette fonctionnalité fait partie d'une offre premium.",
  forbidden: "Tu n'as pas accès à cette ressource.",
  quota: "Tu as atteint ton quota pour aujourd'hui.",
  rate_limited: "Trop de requêtes. Réessaie dans un instant.",
  not_configured: "Bientôt disponible.",
  not_found: "Introuvable.",
  conflict: "Cette ressource existe déjà.",
  validation: "Certaines informations sont invalides.",
  network: "Impossible de joindre le serveur. Vérifie ta connexion.",
  server: "Une erreur est survenue. Réessaie plus tard.",
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.detail || DEFAULT_MESSAGES[err.kind];
  if (err instanceof Error && err.message) return err.message;
  return DEFAULT_MESSAGES.server;
}

/** Endpoint pas encore déployé (contrat v1.1 en cours d'implémentation) → dégrader sans bruit. */
export function isUnsupported(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501);
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
  if (!detail) return new ApiError(status, code, DEFAULT_MESSAGES[err.kind]);
  return err;
}

// ---------------------------------------------------------------------------
// Jeton (mémoire + trousseau sécurisé)

let token: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}
export function getToken(): string | null {
  return token;
}
export async function loadToken(): Promise<string | null> {
  token = await readSecure(STORAGE_KEYS.token);
  return token;
}
export async function setToken(value: string | null): Promise<void> {
  token = value;
  await writeSecure(STORAGE_KEYS.token, value);
}

// ---------------------------------------------------------------------------
// Requêtes

export type QueryValue = string | number | boolean | null | undefined | string[];
export type Query = Record<string, QueryValue>;

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value.join(","))}`);
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Par défaut true : joint le jeton s'il existe. */
  auth?: boolean;
  timeoutMs?: number;
}

function isAbort(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";
}

/** Corps multipart : le moteur fixe lui-même l'en-tête (avec la frontière). */
export function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, signal, auth = true, timeoutMs = 15000 } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  const multipart = isFormData(body);
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  const sentToken = auth ? token : null;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;

  // Délai max : un téléphone pointé vers une mauvaise IP ne doit pas attendre indéfiniment.
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (isAbort(e) && !timedOut) throw e;
    throw new ApiError(0, "network_error", DEFAULT_MESSAGES.network);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
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
    if (err.status === 401 && sentToken && unauthorizedHandler) unauthorizedHandler();
    throw err;
  }
  return data as T;
}

/** Réponse de `POST /admin/places/{id}/photos`. */
export interface UploadedPhoto {
  id: string;
  url: string;
  is_cover: boolean;
}

/**
 * Envoi multipart avec progression (XMLHttpRequest : `fetch` n'expose pas la progression d'envoi).
 * Mêmes conventions d'erreur que `request` ; sans XHR, retombe sur `request`.
 */
export function uploadForm<T>(
  path: string,
  form: FormData,
  { onProgress, timeoutMs = 90000 }: { onProgress?: (ratio: number) => void; timeoutMs?: number } = {},
): Promise<T> {
  if (!onProgress || typeof XMLHttpRequest === "undefined") {
    return request<T>(path, { method: "POST", body: form, timeoutMs });
  }
  const sentToken = token;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    xhr.setRequestHeader("Accept", "application/json");
    if (sentToken) xhr.setRequestHeader("Authorization", `Bearer ${sentToken}`);
    xhr.timeout = timeoutMs;
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }
    const fail = () => reject(new ApiError(0, "network_error", DEFAULT_MESSAGES.network));
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onload = () => {
      let data: unknown = null;
      if (xhr.responseText) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = null;
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(data as T);
        return;
      }
      const err = parseErrorBody(xhr.status, data);
      if (err.status === 401 && sentToken && unauthorizedHandler) unauthorizedHandler();
      reject(err);
    };
    xhr.send(form);
  });
}

// ---------------------------------------------------------------------------
// Points d'entrée

export type Origin = { lat?: number; lng?: number; city?: string; district?: string };

export const api = {
  health: () => request<{ status: string; db: string }>("/health", { auth: false }),

  meta: {
    categories: () => request<Category[]>("/meta/categories", { auth: false }),
    ambiances: () => request<Ambiance[]>("/meta/ambiances", { auth: false }),
    cities: () => request<CityRaw[]>("/meta/cities", { auth: false }).then((list) => list.map(normalizeCity)),
    capabilities: () => request<Capabilities>("/meta/capabilities", { auth: false }),
  },

  places: {
    search: (query: Query, signal?: AbortSignal) => request<SearchResponse>("/places/search", { query, signal }),
    get: (idOrSlug: string, origin?: { lat: number; lng: number } | null) =>
      request<PlaceDetail>(`/places/${encodeURIComponent(idOrSlug)}`, {
        query: origin ? { lat: origin.lat, lng: origin.lng } : undefined,
      }),
    gems: (city?: string) => request<PlaceCard[]>("/places/gems", { query: { city } }),
    report: (id: string, kind: ReportKind, message: string) =>
      request<unknown>(`/places/${encodeURIComponent(id)}/reports`, { method: "POST", body: { kind, message } }),
    review: (id: string, rating: number, text: string) =>
      request<unknown>(`/places/${encodeURIComponent(id)}/reviews`, { method: "POST", body: { rating, text } }),
  },

  recommendations: {
    home: (origin: Origin, signal?: AbortSignal) =>
      request<HomeResponse>("/recommendations/home", { query: origin, signal }),
    /** v1.1 — peut renvoyer 404 tant que le backend ne l'expose pas. */
    similar: (idOrSlug: string) =>
      request<PlaceCard[]>(`/recommendations/similar/${encodeURIComponent(idOrSlug)}`),
  },

  auth: {
    register: (email: string, password: string, display_name: string) =>
      request<AuthResponse>("/auth/register", { method: "POST", body: { email, password, display_name }, auth: false }),
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
    /** v1.1 */
    taste: () => request<Taste>("/me/taste"),
  },

  favorites: {
    list: () => request<PlaceCard[]>("/me/favorites"),
    add: (placeId: string) => request<void>(`/me/favorites/${encodeURIComponent(placeId)}`, { method: "PUT" }),
    remove: (placeId: string) => request<void>(`/me/favorites/${encodeURIComponent(placeId)}`, { method: "DELETE" }),
  },

  collections: {
    list: () => request<CollectionSummary[]>("/me/collections"),
    create: (name: string, description?: string) =>
      request<CollectionSummary>("/me/collections", {
        method: "POST",
        body: description ? { name, description } : { name },
      }),
    get: (id: string) => request<CollectionDetail>(`/me/collections/${encodeURIComponent(id)}`),
    remove: (id: string) => request<void>(`/me/collections/${encodeURIComponent(id)}`, { method: "DELETE" }),
    addItem: (id: string, placeId: string) =>
      request<unknown>(`/me/collections/${encodeURIComponent(id)}/items`, { method: "POST", body: { place_id: placeId } }),
    removeItem: (id: string, placeId: string) =>
      request<void>(`/me/collections/${encodeURIComponent(id)}/items/${encodeURIComponent(placeId)}`, {
        method: "DELETE",
      }),
  },

  itineraries: {
    suggest: (body: SuggestRequest) => request<SuggestResponse>("/itineraries/suggest", { method: "POST", body }),
    list: () => request<ItinerarySummary[]>("/me/itineraries"),
    create: (title: string, steps: ItineraryStepInput[], date?: string) =>
      request<Itinerary>("/me/itineraries", { method: "POST", body: date ? { title, date, steps } : { title, steps } }),
    get: (id: string) => request<Itinerary>(`/me/itineraries/${encodeURIComponent(id)}`),
    remove: (id: string) => request<void>(`/me/itineraries/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  concierge: (message: string, origin: Origin, history: ChatTurn[] = []) =>
    request<ConciergeResponse>("/concierge", {
      method: "POST",
      body: { message, ...origin, history: history.slice(-6) },
      timeoutMs: 30000,
    }),

  billing: {
    plans: () => request<BillingPlan[]>("/billing/plans", { auth: false }),
    checkout: (plan: Plan) => request<unknown>("/billing/checkout", { method: "POST", body: { plan } }),
  },

  /** Photos des lieux — curateurs et administrateurs uniquement. */
  photos: {
    upload: (placeId: string, form: FormData, onProgress?: (ratio: number) => void) =>
      uploadForm<UploadedPhoto>(`/admin/places/${encodeURIComponent(placeId)}/photos`, form, { onProgress }),
    setCover: (mediaId: string) =>
      request<{ id: string; is_cover: boolean }>(`/admin/photos/${encodeURIComponent(mediaId)}/cover`, { method: "PATCH" }),
    remove: (mediaId: string) => request<void>(`/admin/photos/${encodeURIComponent(mediaId)}`, { method: "DELETE" }),
  },

  /** v1.1 — signal de goût, « fire-and-forget » (voir lib/events.ts). */
  event: (type: EventType, placeId: string) =>
    request<void>("/events", { method: "POST", body: { type, place_id: placeId }, timeoutMs: 8000 }),
};

function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

/** Somme des étapes d'un résumé d'itinéraire (forme tolérante). */
export function stepCount(s: ItinerarySummary): number {
  return s.step_count ?? s.steps_count ?? s.count ?? s.steps?.length ?? 0;
}
