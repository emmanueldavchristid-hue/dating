# Contrat d'API — v1

Base URL : `/api/v1` (dev : `http://localhost:8000/api/v1`). JSON partout. Auth : `Authorization: Bearer <jwt>`.
Erreurs : `{"detail": "message lisible", "code": "snake_case_code"}` avec statut HTTP adapté
(400 validation, 401 non authentifié, 403 `forbidden` / `premium_required`, 404 `not_found`,
409 `conflict`, 429 `rate_limited` / `quota_exceeded`, 501 `not_configured`).

Règle produit : **le backend ne fabrique jamais** de temps de trajet, d'horaire, de note ou de disponibilité.
Un champ inconnu vaut `null` (ou `"unknown"` pour un statut). `distance_km` est **à vol d'oiseau** ;
`travel` n'est rempli que si un fournisseur d'itinéraires est configuré.

## Types communs

```ts
type Tier = "free" | "premium";
type OpenStatus = "open" | "closed" | "unknown";
type Plan = "free" | "plus" | "insider";
type Role = "user" | "curator" | "admin";

interface PlaceCard {
  id: string; slug: string; name: string; short_description: string;
  city: string; district: string | null;
  categories: string[];            // slugs
  ambiances: string[];             // slugs
  price_level: number | null;      // 1..4
  budget_min_fcfa: number | null; budget_max_fcfa: number | null;
  rating_avg: number | null; rating_count: number;
  cover: { url: string | null; gradient: [string, string]; alt: string };
  location: { lat: number; lng: number } | null;  // null si verrouillé
  distance_km: number | null;      // vol d'oiseau depuis l'origine
  travel: { mode: "driving" | "walking"; minutes: number; source: string } | null;
  open_status: OpenStatus; closes_at: string | null;  // "HH:MM"
  tier: Tier; locked: boolean;     // locked=true : pépite non accessible au plan actuel (champs réduits)
  is_demo: boolean;                // donnée fictive de démonstration
  verified_at: string | null; confidence: number;    // 0..1
  score: number | null; reasons: string[];          // explications de classement
}

interface PlaceDetail extends PlaceCard {
  description: string; address: string | null; phone: string | null; website: string | null;
  hours: { weekday: number; open: string; close: string }[];   // 0 = lundi ; [] = inconnu
  amenities: { parking: boolean|null; wheelchair: boolean|null; wifi: boolean|null;
               card_payment: boolean|null; mobile_money: boolean|null; outdoor: boolean|null };
  photos: { url: string | null; gradient: [string, string]; alt: string; credit: string | null }[];
  reviews_summary: string | null;
  reviews: { id: string; author: string; rating: number; text: string; created_at: string }[];
  source: { kind: "demo" | "osm" | "partner" | "curated"; attribution: string | null };
  events: { id: string; title: string; starts_at: string; price_fcfa: number | null }[];
  is_favorite: boolean;
}

interface User {
  id: string; email: string; display_name: string; role: Role; plan: Plan;
  preferences: { categories: string[]; ambiances: string[]; budget_max_fcfa: number | null; home_city: string | null };
  location_consent: boolean;
}
```

## Méta (public)
- `GET /health` → `{status:"ok", db:"ok"}`
- `GET /meta/categories` → `{slug,name,icon}[]` · `GET /meta/ambiances` → `{slug,name}[]`
- `GET /meta/cities` → `{slug,name,center:{lat,lng},districts:string[]}[]`
- `GET /meta/capabilities` → `{map:"osm"|"none", routing:"none"|"osrm", ai:"rules"|"anthropic", payments:"none"|string, demo_data:boolean}`

## Lieux (public, auth optionnelle — l'auth débloque le premium)
- `GET /places/search` — query : `lat,lng` (si consentement) **ou** `city` (slug), `district`, `q`, `categories=a,b`,
  `ambiances=x,y`, `budget_max`, `open_now=true`, `max_distance_km`, `parking`, `wheelchair`, `min_rating`,
  `sort=relevance|distance|popularity|newest`, `page` (1..), `page_size` (1..50, défaut 20)
  → `{items: PlaceCard[], total, page, page_size, origin:{lat,lng,source:"gps"|"city"}}`
- `GET /places/{id_or_slug}?lat&lng` → `PlaceDetail` ; 403 `premium_required` si pépite non débloquée.
- `GET /places/gems?city` → `PlaceCard[]` (verrouillées pour plan free : nom générique, pas de position).
- `GET /recommendations/home?lat&lng&city` → `{sections:{key,title,subtitle,items:PlaceCard[]}[]}`
- `POST /places/{id}/reports` (auth) `{kind:"closed"|"wrong_hours"|"wrong_location"|"wrong_price"|"other", message}` → 201
- `POST /places/{id}/reviews` (auth) `{rating:1..5, text}` → 201

## Auth & compte
- `POST /auth/register` `{email,password(>=8),display_name}` → `{access_token, token_type:"bearer", user}`
- `POST /auth/login` `{email,password}` → idem
- `GET /me` → `User` · `PATCH /me/preferences` (partiel) → `User` · `POST /me/consent` `{location:boolean}` → `User`
- `GET /me/export` → JSON de toutes les données de l'utilisateur · `DELETE /me` → 204

## Favoris & collections (auth)
- `GET /me/favorites` → `PlaceCard[]` · `PUT /me/favorites/{place_id}` → 204 · `DELETE /me/favorites/{place_id}` → 204
- `GET /me/collections` → `{id,name,description,count}[]` · `POST /me/collections` `{name,description?}`
- `GET /me/collections/{id}` → `{id,name,description,items:PlaceCard[]}` · `DELETE /me/collections/{id}`
- `POST /me/collections/{id}/items` `{place_id}` · `DELETE /me/collections/{id}/items/{place_id}`

## Itinéraires
- `POST /itineraries/suggest` (auth) `{lat?,lng?,city?,categories?,ambiances?,budget_max_fcfa?,steps:2..5}`
  → `{steps:{place:PlaceCard, leg_km:number|null}[], total_budget_min_fcfa, total_budget_max_fcfa, notes:string[]}`
  (plan free : 2 étapes max ; au-delà 403 `premium_required`)
- `GET /me/itineraries` · `POST /me/itineraries` `{title, date?, steps:{place_id,start_time?,note?}[]}`
- `GET /me/itineraries/{id}` → `{id,title,date,steps:{position,place:PlaceCard,start_time,note,leg_km}[]}` · `DELETE`

## Concierge (auth)
- `POST /concierge` `{message, lat?, lng?, city?}` → `{reply, places:PlaceCard[], parsed:{categories,ambiances,budget_max_fcfa,open_now,q}, provider:"rules"|"anthropic", quota:{used,limit}}`
  ; 429 `quota_exceeded`. Les lieux cités viennent **toujours** de la base.

## Abonnements
- `GET /billing/plans` → `{code,name,price_fcfa:number|null,features:string[],quotas:{concierge_per_day,itinerary_max_steps}}[]`
- `GET /me/subscription` → `{plan, status, current_period_end|null}`
- `POST /billing/checkout` `{plan}` → 501 `not_configured` tant qu'aucun agrégateur n'est branché.

## Administration (role admin ; curator : curation seulement)
- `GET /admin/stats` · `GET /admin/places?q&page` · `POST /admin/places` · `PATCH /admin/places/{id}`
- `GET /admin/users?q&page` · `PATCH /admin/users/{id}` `{role?, plan?}`
- `GET /admin/reports?status=open|resolved|rejected` · `PATCH /admin/reports/{id}` `{status}`
- `GET /admin/curation` · `PATCH /admin/curation/{id}` `{decision:"approved"|"rejected", note?}`
- `GET /admin/audit?page`
Listes paginées admin : `{items, total, page, page_size}`.
