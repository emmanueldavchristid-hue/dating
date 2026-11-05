# Reprise du travail

Mot de reprise : **« SORTIE REPRISE »**. Quand Jason écrit ce mot (dans n'importe quelle conversation),
Claude relit ce fichier sur la branche `mvp` du dépôt `emmanueldavchristid-hue/dating` et reprend à la
première tâche non cochée, sans redemander le contexte.

Ce fichier est mis à jour à chaque étape terminée et poussée sur GitHub : il est toujours à jour même si
la conversation est coupée (réseau, déplacement, PC éteint).

## Où en est-on (5 novembre 2026, fin de matinée)

Le document « Sortie — Liste complète des améliorations » (validé par Jason le 5/11) sert de feuille de route.
Ordre de travail : semaine 1 corrections rapides → carte → vrai concierge IA → (en parallèle) curation terrain
→ partage et fidélisation → premium et stores.

### Fait

- [x] Audit client et marketing par un agent testeur (6 profils, ~40 demandes, 72 points)
- [x] Lieux de loisirs réintégrés (bowling, karting, paintball, piscines, Splash Park…) ; règle d'import corrigée
- [x] Nouvelles catégories par envies (Manger, Boire un verre, Danser, Se détendre, Jeux & loisirs, En famille,
      Culture) ; catégories et filtres vides masqués ; doublons archivés ; photo hors sujet retirée
- [x] Recherche : synonymes français, nouchi, anglais, fautes de frappe, quartier et ville compris
- [x] Concierge : bug budget, mélange des messages, réponses au hasard, salutations, quota non consommé sur échec
- [x] Adaptateur IA compatible OpenAI (Groq → Gemini → NVIDIA en relais) ; clés dans
      `Documents\sortie-data\cles-ia.env` sur le PC (jamais dans le dépôt)
- [x] Fiche : plus de « Source OpenStreetMap » ni « Confiance 50 % » ; mini-carte ; WhatsApp ; « Y aller »
      (carte de l'app, puis Google Maps / Waze / Plans pour le guidage)
- [x] Carte : démarre sur ma position, tri par distance, « Rechercher dans cette zone », ouverte depuis une fiche
- [x] Nouvelle base (2 874 lieux publiés) copiée sur le PC ; le script la restaure automatiquement

### À faire, dans l'ordre

- [ ] Tester le vrai concierge IA : Jason doit ajouter `api.groq.com`, `generativelanguage.googleapis.com`,
      `integrate.api.nvidia.com` aux domaines autorisés (claude.ai → Paramètres → Capacités), puis vérifier
      les noms de modèles disponibles (`/models`) et ajuster `GROQ_MODEL` / `GEMINI_MODEL` / `NVIDIA_MODEL`
- [x] Trajet tracé dans l'app (OSRM auto-hébergé sur le PC, préparé une fois par le script depuis l'extrait
      OpenStreetMap ; `GET /routes`) et durée calculée « sans trafic » — à vérifier sur le PC au prochain lancement
- [ ] Photos : Jason décide (curation terrain seule ou Google Places en appoint) ; photos Wikimedia à copier
      sur notre stockage
- [ ] Accueil éditorialisé « Ce week-end » + agenda d'événements
- [ ] Partage avec lien (page web publique par lieu et par soirée), WhatsApp en premier
- [ ] Connexion par téléphone, mot de passe oublié, Google/Apple
- [ ] Soirée : modèles (date, afterwork, anniversaire, Bassam) avec ordre logique et heures
- [ ] Pépites : 30 vraies pépites visitées avant le premium ; prix ; paiement Mobile Money
- [ ] Nom définitif, icône, CGU et confidentialité, hébergement, builds stores

## Pour Claude : comment reprendre

1. `git clone` / `git pull` du dépôt, branche `mvp` ; lire ce fichier, `PROGRESS.md`, `docs/API.md`.
2. Base de développement : PostgreSQL local avec la base réelle (`sortie-reel.dump` dans
   `C:\Users\Dell\Documents\sortie-data`, accessible via le dossier relié du PC si la conversation est liée).
3. Tests : `cd backend && pytest -q` · `cd mobile && npx tsc --noEmit && npx expo lint && npx jest` ·
   `cd web && npm test && npm run lint`.
4. Reprendre la première case non cochée ; cocher, committer et pousser après chaque étape.
