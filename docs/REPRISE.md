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

- [x] Thème clair ou sombre au choix (premier écran + profil, ou comme le téléphone) — `themed()` dans tokens.ts
- [x] Suivi du trajet en direct sur la carte (« Démarrer » : ligne qui se raccourcit, temps et distance restants,
      nouveau calcul si on quitte la route, « Tu es arrivé ») — à tester sur téléphone (non visible en web)
- [x] Script PC : mise de côté automatique des fichiers modifiés avant la mise à jour, version affichée

### À faire, dans l'ordre

- [ ] Tester le vrai concierge IA : Jason doit ajouter `api.groq.com`, `generativelanguage.googleapis.com`,
      `integrate.api.nvidia.com` aux domaines autorisés (claude.ai → Paramètres → Capacités), puis vérifier
      les noms de modèles disponibles (`/models`) et ajuster `GROQ_MODEL` / `GEMINI_MODEL` / `NVIDIA_MODEL`
- [x] Trajet tracé dans l'app (OSRM auto-hébergé sur le PC, préparé une fois par le script depuis l'extrait
      OpenStreetMap ; `GET /routes`) et durée calculée « sans trafic » — à vérifier sur le PC au prochain lancement
- [x] Photos Google Places (code prêt et testé avec réponses simulées) : place_id seul conservé, photos jamais
      copiées (redirection via le serveur), crédit « Google », plafond quotidien. Il manque la clé de Jason
      (`GOOGLE_PLACES_API_KEY` dans `Documents\sortie-data\cles-ia.env`) et le domaine `places.googleapis.com`.
      Le script relie les lieux à Google une fois (`python -m app.tasks link-google`).
- [x] Ajout rapide de lieu dans l'admin (pépites vues sur TikTok) : coller le lien Google Maps → position,
      quartier déduit, téléphone/WhatsApp, Instagram/TikTok du lieu, relié à Google pour les photos — PAS de bouton « Proposer un lieu » côté
      utilisateurs (décision de Jason du 6/11)
- [ ] (ancien) Photos et nouveaux lieux : Jason repère pépites et nouveaux endroits sur TikTok/Instagram. Proposition
      (en attente de son accord) : coller un lien TikTok/Instagram dans l'admin → lieu créé + vidéo officielle
      intégrée sur la fiche (lecteur officiel, crédit au créateur, pas de copie) ; photos des lieux partenaires ;
      bouton « Proposer un lieu » pour les utilisateurs. Pas d'aspiration (interdit par leurs conditions).
- [x] Agenda « Ce week-end » (jeudi → dimanche, sinon « Cette semaine ») : en tête de l'accueil, écran Agenda
      par jour, « À venir ici » sur la fiche ; onglet Agenda dans l'admin (ajout/modif/suppression, curateurs
      compris). Contenu à saisir chaque semaine par l'équipe.
- [ ] Partage avec lien (page web publique par lieu et par soirée), WhatsApp en premier — après le choix de
      l'hébergement (décision du 5/11 : plus tard)
- [x] Mot de passe oublié par e-mail : code à 6 chiffres (empreinte seule, 15 min, 5 essais), même réponse que
      le compte existe ou non. Envoi réel à activer avec l'hébergement (MAIL_PROVIDER=smtp + SMTP_*) ; sans ça
      l'app le dit honnêtement. Écran mobile seulement (web à faire si besoin).
- [x] Soirée : modèles en un toucher (date romantique, afterwork, anniversaire, dimanche à Bassam, famille),
      étapes dans un ordre logique, proches les unes des autres, heures suggérées (`GET /itineraries/templates`)
- [ ] Pépites : 30 vraies pépites visitées avant le premium ; prix ; paiement Mobile Money
- [x] CGU et politique de confidentialité (version de travail, fidèle au fonctionnement réel, à faire relire par
      un juriste ; société, adresse, contact et hébergeur entre crochets) : écran « Informations légales »,
      lien à l'inscription — `mobile/src/lib/legal.ts`
- [ ] Nom définitif, icône, hébergement, builds stores

## Pour Claude : comment reprendre

1. `git clone` / `git pull` du dépôt, branche `mvp` ; lire ce fichier, `PROGRESS.md`, `docs/API.md`.
2. Base de développement : PostgreSQL local avec la base réelle (`sortie-reel.dump` dans
   `C:\Users\Dell\Documents\sortie-data`, accessible via le dossier relié du PC si la conversation est liée).
3. Tests : `cd backend && pytest -q` · `cd mobile && npx tsc --noEmit && npx expo lint && npx jest` ·
   `cd web && npm test && npm run lint`.
4. Reprendre la première case non cochée ; cocher, committer et pousser après chaque étape.
