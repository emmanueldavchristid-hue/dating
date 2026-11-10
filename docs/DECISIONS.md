# Décisions techniques

| # | Décision | Pourquoi | Alternative gardée ouverte |
| --- | --- | --- | --- |
| 1 | Web responsive Next.js pour le MVP | Exécutable et démontrable immédiatement, administration incluse, un seul langage côté interface | Application Expo réutilisant `docs/API.md` et le client typé |
| 2 | FastAPI + SQLAlchemy 2 + Alembic | Python, rapide à écrire, validation Pydantic, documentation OpenAPI automatique | — |
| 3 | PostgreSQL + PostGIS + pgvector, pas de Supabase | Un seul moteur pour relationnel, géo et vecteurs ; aucune dépendance à un service hébergé | Supabase reste possible comme hébergeur PostgreSQL |
| 4 | Authentification JWT maison (Argon2id + PyJWT) | Simple, testée, sans service externe | Fournisseur OIDC (Supabase Auth, Auth0, Clerk) derrière la même dépendance `current_user` |
| 5 | Classement déterministe en SQL | Explicable, testable, paginable sur gros volumes, fonctionne sans IA | Apprentissage du classement (learning to rank) quand il y aura des interactions |
| 6 | Taxonomie normalisée + tableaux dénormalisés | Intégrité (tables de liaison) et vitesse (GIN, aucune jointure dans la recherche) | — |
| 7 | IA optionnelle, derrière un adaptateur | L'app doit fonctionner sans clé ; le modèle ne voit que des faits issus de la base et n'exécute jamais de SQL | Autre fournisseur LLM : implémenter `LLMProvider` |
| 8 | Pas de Redis ni de workers au démarrage | Inutile au volume actuel ; limitation de débit en mémoire, tâches via cron | Redis pour le cache et le rate limit multi-instance ; Celery/Arq si des tâches longues apparaissent |
| 9 | Temps de trajet seulement via un fournisseur d'itinéraires | Une distance à vol d'oiseau n'est pas une durée ; on n'invente pas | OSRM auto-hébergé, Mapbox ou Google Routes via `RoutingProvider` |
| 10 | Carte OpenStreetMap (Leaflet) | Gratuite, licence claire, sans clé | Mapbox pour un style plus premium |
| 11 | Paiement non simulé | Aucune fausse transaction ; tables `subscriptions`/`payments` et adaptateur prêts | Agrégateur Mobile Money (CinetPay, PayDunya…) à valider : disponibilité, frais, conditions |
| 12 | Données de démo fictives | Aucun établissement réel décrit sans source ; badge « Démo » visible | Import OSM (ODbL, attribution) puis curation terrain |
