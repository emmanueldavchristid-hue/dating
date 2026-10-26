# Base de données

PostgreSQL 16 + **PostGIS** (géographie) + **pgvector** (préparé pour la recherche sémantique) + **pg_trgm** et **unaccent** (recherche texte tolérante aux fautes et aux accents).
Le schéma est versionné par Alembic (`backend/alembic/versions/`). Source de vérité : `backend/app/models.py`.

## Entités

| Domaine | Tables | Notes |
| --- | --- | --- |
| Géographie | `cities`, `districts` | Centres en `geography(POINT,4326)` ; une nouvelle ville = une ligne, pas de code |
| Taxonomie | `categories`, `ambiances`, `tags` + liaisons `place_categories`, `place_ambiances`, `place_tags` | Tables de liaison = vérité normalisée |
| Lieux | `places`, `opening_hours`, `opening_exceptions`, `media`, `events` | Photos : seulement la **clé** S3 (`cover_key`, `media.storage_key`), jamais le fichier |
| Provenance | `data_sources`, `places.source_id / is_demo / verified_at / confidence / external_ref` | Sépare démo, OSM, partenaires, curation, utilisateurs |
| Utilisateurs | `users`, `user_preferences` | E-mail unique insensible à la casse ; mot de passe Argon2id |
| Offres | `plans`, `subscriptions`, `payments` | Droits lus depuis `plans` (quotas, accès pépites) ; `payments` unique par `(provider, provider_ref)` (idempotence des webhooks) |
| Contenus | `reviews`, `reports`, `favorites`, `collections`, `collection_items` | Un avis par utilisateur et par lieu ; collections éditoriales possibles (`user_id` NULL) |
| Sorties | `itineraries`, `itinerary_steps` | Étapes ordonnées, unicité `(itinerary_id, position)` |
| Vie privée | `search_history`, `concierge_usage` | Position arrondie à ~1 km ; purge automatique (`python -m app.tasks purge-history`) |
| Gouvernance | `partners`, `curation_items`, `audit_log` | Curation : pépites, infos anciennes, signalements contradictoires |

## Parcours critique : recherche

Une seule requête SQL filtre, classe et pagine, sans jointure :
- **Index GiST** sur `places.location` → `ST_DWithin` (rayon) et `ST_Distance` (tri).
- **Tableaux dénormalisés** `category_slugs`, `ambiance_slugs` (index **GIN**, opérateur `&&`) : évite deux jointures n-n à chaque recherche. Ils sont réécrits par `services/places.set_taxonomy`, en même temps que les tables de liaison.
- **Agrégats dénormalisés** `rating_avg`, `rating_count`, `popularity`, recalculés à l'écriture d'un avis.
- **Texte** : colonne générée `search_vector` (tsvector sans accents, index GIN) + index trigramme sur `name`.
- Index composite `(city_id, status, tier)` pour le filtrage par ville et par offre.
- `count(*) OVER()` donne le total dans la même requête ; `page_size` est plafonné à 50.

## Montée en charge (de centaines à centaines de milliers de lieux)

Ce qui est en place : index adaptés, pagination bornée, limitation de débit, requêtes sans N+1 (horaires et coordonnées chargés par lot), tables d'événements volumineux isolées.

Ce qui est prévu quand le volume le justifiera (non garanti automatiquement, à mesurer) :
1. **Partitionnement mensuel** de `search_history` (et d'une future table d'interactions) par `created_at`.
2. **Réplicas en lecture** pour la recherche ; écritures sur le primaire.
3. **Cache Redis** des sections d'accueil par zone et par heure (aujourd'hui non requis).
4. Pagination par curseur (keyset) au-delà de quelques milliers de résultats.
5. Index HNSW sur `places.embedding` quand un fournisseur d'embeddings sera branché.
6. Découpage par région/pays (`city_id` est déjà la clé naturelle).

## Règles de données

- Une information inconnue reste **NULL** (équipements, budget, horaires) : l'API ne la suppose jamais.
- Les lieux de démo ont `is_demo = true`, la source « Démonstration » et aucune date de vérification.
- Les statuts et valeurs fermées sont protégés par des contraintes `CHECK`.
- Supprimer un compte supprime ses données personnelles (cascade) ; ses avis restent, anonymisés.
