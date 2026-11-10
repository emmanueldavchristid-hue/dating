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
  city: string; district: string | null;   // noms affichables (pas des slugs)
  categories: string[];            // slugs
  ambiances: string[];             // slugs
  price_level: number | null;      // 1..4
  budget_min_fcfa: number | null; budget_max_fcfa: number | null;
  rating_avg: number | null; rating_count: number;
  cover: { url: string | null; gradient: [string, string]; alt: string;
           credit: string | null;  // « Photo : auteur · licence · Wikimedia Commons », « Google Maps », « Illustration »
           kind: "photo" | "wikimedia" | "google" | "illustration" };  // voir « Photos : ordre et droits »
  location: { lat: number; lng: number } | null;  // null si verrouillé
  distance_km: number | null;      // vol d'oiseau depuis l'origine
  travel: { mode: "driving" | "walking"; minutes: number; source: string } | null;
  open_status: OpenStatus; closes_at: string | null;  // "HH:MM"
  tier: Tier; locked: boolean;     // locked=true : pépite non accessible au plan actuel (champs réduits)
  is_demo: boolean;                // donnée fictive de démonstration
  verified_at: string | null; confidence: number;    // 0..1
  score: number | null; reasons: string[];          // explications de classement
  match: number | null;            // 0..100 : affinité avec les goûts de l'utilisateur connecté (null si anonyme ou pas assez de signaux)
}

interface PlaceDetail extends PlaceCard {
  description: string; address: string | null; phone: string | null; website: string | null;
  hours: { weekday: number; open: string; close: string }[];   // 0 = lundi ; [] = inconnu
  amenities: { parking: boolean|null; wheelchair: boolean|null; wifi: boolean|null;
               card_payment: boolean|null; mobile_money: boolean|null; outdoor: boolean|null };
  photos: { id: string | null; url: string | null; gradient: [string, string]; alt: string; credit: string | null;
            kind: "photo" | "wikimedia" | "google"; author: string | null; license: string | null;
            license_url: string | null; source_page: string | null }[];   // photos affichables uniquement, dans l'ordre
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
- `GET /meta/categories` → `{slug,name,icon,group,count}[]` (`count` = lieux publiés ; l'app masque les catégories vides) · `GET /meta/ambiances` → `{slug,name,count}[]`
- `GET /meta/groups` → envies `{slug,name,icon,categories[]}[]` (Manger, Boire un verre, Danser, Se détendre, Jeux & loisirs, En famille, Culture), catégories non vides seulement
- `GET /meta/capabilities` → `{map, routing, ai ("rules" ou fournisseurs, ex. "groq,gemini"), payments, demo_data, coverage{budget,rating,parking,wheelchair,hours}}`
- `GET /meta/cities` → `{slug,name,center:{lat,lng},districts:{slug,name}[]}[]`
- `GET /meta/capabilities` → `{map:"osm"|"none", routing:"none"|"osrm", ai:"rules"|"anthropic", payments:"none"|string, demo_data:boolean}`

## Lieux (public, auth optionnelle — l'auth débloque le premium)
- `GET /places/search` — `q` est interprété (vocabulaire français, nouchi, anglais, fautes de frappe) : « bowling », « boîte Marcory », « plage Bassam » deviennent des filtres, renvoyés dans `understood {categories?, district?, city?}` ; sinon recherche par nom.
  Query : `lat,lng` (si consentement) **ou** `city` (slug), `district`, `q`, `categories=a,b`,
  `ambiances=x,y`, `budget_max`, `open_now=true`, `max_distance_km`, `parking`, `wheelchair`, `min_rating`,
  `sort=relevance|distance|popularity|newest`, `page` (1..), `page_size` (1..50, défaut 20)
  → `{items: PlaceCard[], total, page, page_size, origin:{lat,lng,source:"gps"|"city"}}`
- `GET /places/{id_or_slug}?lat&lng` → `PlaceDetail` ; 403 `premium_required` si pépite non débloquée.
- `GET /places/gems?city` → `PlaceCard[]` (verrouillées sans l'offre Insider : nom générique, pas de position).
- `GET /recommendations/home?lat&lng&city` → `{sections:{key,title,subtitle,items:PlaceCard[]}[]}`
- `POST /places/{id}/reports` (auth) `{kind:"closed"|"wrong_hours"|"wrong_location"|"wrong_price"|"other", message}` → 201
- `POST /places/{id}/reviews` (auth) `{rating:1..5, text}` → 201

## Matching & signaux (v1.1)
- `POST /events` (auth optionnelle) `{type:"view"|"favorite"|"share"|"directions"|"call"|"itinerary_add"|"dismiss", place_id}` → 204.
  Alimente le profil de goûts (anonyme : ignoré côté profil, compté en popularité seulement pour view).
- `GET /recommendations/similar/{id_or_slug}` → `PlaceCard[]` (≤ 10 lieux proches par le sens, la catégorie et l'ambiance).
- `GET /me/taste` (auth) → `{top_categories:{slug,weight}[], top_ambiances:{slug,weight}[], budget_typical_fcfa:number|null, signals:number}`
  — ce que l'app a compris des goûts de l'utilisateur (transparence).

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
- `GET /me/itineraries` → `{id,title,date,step_count}[]` · `POST /me/itineraries` `{title, date?, steps:{place_id,start_time?,note?}[]}`
- `GET /me/itineraries/{id}` → `{id,title,date,steps:{position,place:PlaceCard,start_time,note,leg_km}[]}` · `DELETE`

## Concierge (auth)
- `POST /concierge` `{message, lat?, lng?, city?, history?:{role:"user"|"assistant",content}[] (≤ 6)}`
  → `{reply, places:PlaceCard[], parsed:{categories,ambiances,budget_max_fcfa,open_now,q,district}, provider:"rules"|"anthropic", retrieval:"hybrid"|"lexical", quota:{used,limit}}`
  ; 429 `quota_exceeded`. Les lieux cités viennent **toujours** de la base.

## Abonnements
- `GET /billing/plans` → `{code,name,price_fcfa:number|null,features:string[],quotas:{concierge_per_day,itinerary_max_steps}}[]`
- `GET /me/subscription` → `{plan, status, current_period_end|null}`
- `POST /billing/checkout` `{plan}` → 501 `not_configured` tant qu'aucun agrégateur n'est branché.

## Photos : ordre et droits
Ordre d'affichage (calculé par le serveur, `services/photos.py`) :
1. **photo réelle autorisée** : `owner` (fournie par le lieu, avec son accord), `team` (prise par l'équipe),
   `licensed` (photographe / licence, accord à préciser) ;
2. **photo Wikimedia Commons validée** par l'équipe (auteur + licence obligatoires ; les photos trouvées par les
   imports arrivent « à valider » et ne s'affichent pas avant) ;
3. **option Google** (désactivée par défaut, `GOOGLE_PHOTOS_ENABLED`, voir docs/GOOGLE-PHOTOS.md) ;
4. sinon **illustration** de l'app : `cover.kind = "illustration"`, `credit = "Illustration"`, toujours signalée.

Endpoints (curateurs et admins) :
- `GET /admin/places/{id}/photos` → `{cover_kind, items: AdminPhoto[]}` (toutes, y compris à valider / refusées)
- `POST /admin/places/{id}/photos` multipart : `file`, `source_kind` (owner|team|licensed), `author` (obligatoire),
  `license?`, `license_url?`, `source_page?`, `rights_note` (obligatoire pour owner/licensed), `rights_confirmed=true`
  (obligatoire), `make_cover?` → `AdminPhoto` (201) ; erreurs `rights_required` (422), `invalid_image` (400), 413
- `PATCH /admin/photos/{id}` `{status?: approved|rejected|pending, source_kind?, author?, license?, license_url?,
  source_page?, rights_note?}` (valider une photo Wikimedia exige auteur et licence)
- `PATCH /admin/photos/{id}/cover` (met la photo en tête de son rang ; une photo réelle reste devant Wikimedia)
- `DELETE /admin/photos/{id}` (204)

`AdminPhoto = {id, url, source_kind, source_label, author, license, license_url, source_page, rights_note,
status, credit, is_cover, position, created_at}`. Chaque action est journalisée (audit).

## Administration (role admin ; curator : curation seulement)
- `GET /admin/stats` · `GET /admin/places?q&page` · `POST /admin/places` · `PATCH /admin/places/{id}`
- `GET /admin/users?q&page` · `PATCH /admin/users/{id}` `{role?, plan?}`
- `GET /admin/reports?status=open|resolved|rejected` · `PATCH /admin/reports/{id}` `{status}`
- `GET /admin/curation` · `PATCH /admin/curation/{id}` `{decision:"approved"|"rejected", note?}`
- `GET /admin/audit?page`
Listes paginées admin : `{items, total, page, page_size}`. Éléments :
- lieux : `{id,slug,name,city,district,categories,ambiances,tier,status,is_demo,rating_avg,rating_count,budget_min_fcfa,budget_max_fcfa,price_level,short_description,verified_at,confidence}`
- signalements : `{id, place:{id,slug,name}, kind, message, status, created_at}`
- curation : `{id, reason:"gem_candidate"|"stale"|"contradictory"|"user_reports", detail, status, created_at, place: PlaceCard}`
- audit : `{id, actor_id, action, entity_type, entity_id, data, created_at}`
- stats : `{places, places_published, gems, demo_places, users, premium_users, open_reports, pending_curation}`
