# État du projet — v0.2

Dernière mise à jour : 28 octobre 2026 · Branche `mvp` · Pull request #1

## Prêt à être donné à un client ?

**Pas encore.** L'application est complète et fonctionne de bout en bout, mais elle tourne sur des **lieux fictifs**.
Trois choses la séparent d'une première version client :
1. importer les vrais lieux et photos (commande prête, bloquée par l'accès réseau de l'environnement de développement) ;
2. la tester sur de vrais téléphones (Expo Go) ;
3. l'héberger en ligne.

## Fonctionnel et testé

| Domaine | État |
| --- | --- |
| **App mobile** Expo (Android + iPhone) : 5 onglets + onboarding, recherche, fiche, soirée, favoris, collections, compte, premium | ✅ bundles Android/iOS compilés, 46 tests, 41 écrans vérifiés (rendu web) |
| **App web** + console d'administration | ✅ 61 tests, 34/34 vérifications de bout en bout |
| Recherche multicritère géolocalisée, classement 0–100 explicable | ✅ |
| **Matching** : profil de goûts (préférences + favoris, itinéraires, appels, partages, vues, avis), affinité « xx % pour toi », lieux similaires (sens + « aimé par les mêmes personnes ») | ✅ |
| **RAG** : fiches, résumés et avis indexés (pgvector HNSW + plein texte), recherche hybride, concierge avec relances, garde-fou anti-lieu inventé | ✅ en mode lexical (voir ci-dessous) |
| Premium contrôlé côté serveur, quotas, pépites verrouillées (sans nom, position ni slug révélateur) | ✅ |
| Import OpenStreetMap multi-villes + photos libres Wikimedia (licence et auteur) | ✅ testé avec réponses simulées |
| Comptes, rôles, export et suppression des données, audit, curation | ✅ |
| CI GitHub : backend, web, mobile | ✅ |

## Simulé, désactivé ou non vérifié

- **Données** : 38 lieux fictifs (badge « Démo »). Commande d'import réel prête : `python -m app.importers --publish --purge-demo`.
- **Réseau de développement** : `overpass-api.de`, `wikidata.org`, `commons.wikimedia.org`, `huggingface.co` sont bloqués → à autoriser dans claude.ai (Paramètres → Capacités).
- **Recherche « par le sens »** : encodeur hors ligne (mots, trigrammes, synonymes métier) en attendant le modèle multilingue `fastembed`.
- **IA du concierge** : mode règles ; adaptateur Claude prêt, testé avec réponses simulées, sans clé réelle.
- **Mobile sur appareil réel** : non testé ici (carte native, GPS, partage, haptique, appel). Icône et écran de démarrage par défaut.
- **Temps de trajet** : aucun fournisseur (OSRM prêt). **Paiement** : aucun agrégateur. **Photos Google** : non implémenté (API officielle payante, à décider).
- **Docker Compose** : non exécuté (pas de Docker ici).

## Tests

| Commande | Résultat |
| --- | --- |
| `cd backend && pytest -q` | 59 réussis (PostgreSQL/PostGIS/pgvector réel) |
| `cd web && npm test && npm run lint && npm run build` | 61 réussis, OK |
| `cd mobile && npx tsc --noEmit && npx expo lint && npm test` | 0 erreur, 46 réussis |
| `cd mobile && npx expo export --platform android` (et ios) | bundles compilés |
| E2E web (`web/e2e/smoke.mjs`) / mobile rendu web (`mobile/e2e/screens.mjs`) | 34/34 · 41/41 |

## Prochaines tâches

1. Ouvrir l'accès réseau, lancer l'import réel (Abidjan, Grand-Bassam, Assinie) et passer à `fastembed`.
2. Test sur téléphones avec Expo Go ; corriger ce qui ne se voit que sur appareil (carte, permissions).
3. Clé API Claude → concierge IA ; contrôle qualité des réponses.
4. Icône, écran de démarrage, nom définitif.
5. Hébergement (API + base + web), puis builds stores (EAS).
6. Agrégateur Mobile Money, OSRM, stockage photos S3 + curation terrain.
