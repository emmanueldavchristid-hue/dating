# État du projet — MVP v0.1

Dernière mise à jour : 26 octobre 2026 · Branche `mvp`

## Fonctionnel et testé de bout en bout

| Domaine | État |
| --- | --- |
| Base PostgreSQL + PostGIS + pgvector, migration Alembic `0001` (montée et descente testées) | ✅ |
| Recherche : GPS ou ville/quartier, multi-catégories, ambiances, budget FCFA, ouvert maintenant, rayon, parking, PMR, note min., 4 tris, pagination | ✅ |
| Classement déterministe 0–100 et raisons affichées | ✅ |
| Accueil personnalisé (5 sections), découverte, carte Leaflet/OSM avec mode dégradé, fiche lieu complète | ✅ |
| Comptes (Argon2id + JWT), rôles user/curator/admin, préférences, consentement de géolocalisation | ✅ |
| Favoris, collections, avis (note recalculée), signalements | ✅ |
| Itinéraires multi-étapes : suggestion, enregistrement, détail (limites par offre côté serveur) | ✅ |
| Concierge en mode règles, quotas journaliers par offre, réponses limitées aux lieux de la base | ✅ |
| Pépites premium verrouillées côté serveur (nom et position masqués pour l'offre gratuite) | ✅ |
| Administration : statistiques, lieux (création/édition), utilisateurs (rôle/offre), signalements, curation, journal d'audit | ✅ |
| Export et suppression du compte, historique de recherche arrondi et purgeable | ✅ |
| Importeur OpenStreetMap (lieux créés en brouillon, à curer) | ✅ |
| Tâches planifiées : purge de l'historique, file de curation (anciens, signalés, contradictoires) | ✅ |

## Simulé, désactivé ou non vérifié — à dire clairement

- **Données** : les 38 lieux, avis et horaires sont **fictifs** (badge « Démo », bandeau en pied de page).
- **Visuels** : dégradés générés, aucune photo réelle (`MEDIA_BASE_URL` non configuré).
- **Temps de trajet** : aucun fournisseur branché → seule la distance à vol d'oiseau est affichée. L'adaptateur OSRM est codé et couvert par des tests unitaires, mais pas essayé sur un vrai serveur.
- **IA** : le concierge tourne en mode règles. L'adaptateur Anthropic est codé et testé avec des réponses simulées, mais pas avec une vraie clé.
- **Paiement** : aucun agrégateur intégré ; le passage à une offre payante renvoie « bientôt disponible ». Un administrateur peut attribuer une offre manuellement (tracé dans l'audit).
- **Carte** : tuiles OSM non chargeables depuis l'environnement de développement ; le mode dégradé a été vérifié, le rendu réel des tuiles non.
- **Docker Compose** : écrit mais pas exécuté (pas de démon Docker disponible). La CI GitHub, elle, est verte.
- **Recherche sémantique (pgvector)** : colonne et extension prêtes, aucun fournisseur d'embeddings.
- **Alertes de découverte, collections éditoriales exclusives** : modèle de données prêt, pas d'interface.

## Tests exécutés

| Commande | Résultat |
| --- | --- |
| `cd backend && pytest -q` | 42 réussis (unitaires + intégration sur PostgreSQL/PostGIS réel) |
| `cd backend && ruff check app tests alembic` | OK |
| `cd web && npm test` | 61 réussis (client API, formatages, filtres ⇄ URL, règles d'honnêteté des cartes) |
| `cd web && npm run lint && npm run build` | OK, 0 avertissement, 16 routes |
| CI GitHub Actions (backend + web) | ✅ verte sur `mvp` |
| `node web/e2e/smoke.mjs` (build de production + API réelle) | 34/34 vérifications, téléphone 390×844 et bureau 1440×900, 4 profils |

## Prochaines tâches, par priorité

1. **Valider Docker Compose** sur une machine avec Docker (`docker compose up --build`).
2. **Données réelles** : importer OSM pour Abidjan (`python -m app.importers.osm --city abidjan --fetch`), puis organiser la curation terrain des premiers lieux publiés et de leurs photos sous licence.
3. **Itinéraires réels** : héberger un OSRM (extrait Côte d'Ivoire de Geofabrik) et définir `ROUTING_PROVIDER=osrm`.
4. **Paiement** : choisir un agrégateur Mobile Money (vérifier disponibilité, frais, KYC), implémenter `PaymentProvider` et le webhook vers `payments` / `subscriptions`.
5. **Concierge IA** : brancher `ANTHROPIC_API_KEY`, ajouter un contrôle qui vérifie que chaque lieu cité dans la réponse existe dans la liste fournie.
6. **Stockage photos** : bucket S3 compatible + endpoint d'upload signé + modération.
7. **Production** : Redis pour la limitation de débit multi-instance, sauvegardes, journalisation centralisée, en-têtes de sécurité, déclaration ARTCI.
8. **Mobile natif** : application Expo réutilisant `docs/API.md` et `web/src/lib/`.

## Pour reprendre

Lire `README.md` (lancement), `docs/API.md` (contrat), `docs/DATABASE.md` (schéma), `docs/DECISIONS.md` (choix).
Le contrat `docs/API.md` reflète l'implémentation actuelle (écarts relevés pendant l'intégration corrigés).
