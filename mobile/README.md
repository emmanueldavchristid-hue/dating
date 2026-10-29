# Sortie — application mobile (Android + iOS)

Application Expo (SDK 58, React Native 0.88, TypeScript strict, expo-router) du concierge de sorties.
Elle consomme l'API décrite dans `../docs/API.md`. Nom de code modifiable à un seul endroit :
`EXPO_PUBLIC_APP_NAME` (lu par `src/lib/config.ts` et `app.config.ts`).

## Tester sur ton téléphone avec Expo Go

1. Installe **Expo Go** (App Store ou Google Play). Il doit prendre en charge le **SDK 58**
   (c'est le cas de la version courante des stores au moment de l'écriture).
2. Lance l'API sur ton ordinateur (voir le README racine) : `http://localhost:8000/api/v1/health` doit répondre.
3. Téléphone et ordinateur sur **le même Wi-Fi**. Trouve l'IP locale de l'ordinateur
   (`ipconfig` sous Windows, `ipconfig getifaddr en0` sous macOS, `hostname -I` sous Linux).
4. Dans ce dossier :
   ```bash
   npm install
   cp .env.example .env
   # dans .env : EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/api/v1   (ton IP, pas localhost)
   npx expo start
   ```
   L'API doit écouter sur le réseau local (`uvicorn ... --host 0.0.0.0`). Si l'ordinateur bloque le port 8000, autorise-le dans le pare-feu.
5. Scanne le QR code : appareil photo (iOS) ou Expo Go (Android). Si le réseau est capricieux : `npx expo start --tunnel`.

Comptes de démo (mot de passe `Demo-2026!`) : `user@sortie.demo` (gratuit), `insider@sortie.demo` (Insider), `admin@sortie.demo`.

Si l'app affiche « Hors connexion », c'est presque toujours `EXPO_PUBLIC_API_URL` (localhost au lieu de l'IP) ou le pare-feu.
Après une modification de `.env`, relance `npx expo start -c`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (config Expo + règles React Compiler) |
| `npm test` | Jest (jest-expo + Testing Library) : client API, formatages, filtres, règles d'honnêteté des cartes |
| `npm run export:android` | Bundle JS natif Android (vérifie que tout compile) |
| `npm run e2e` | Captures de tous les écrans (Playwright, export web, voir `e2e/screens.mjs`) |

Pour `npm run e2e` : `EXPO_PUBLIC_API_URL=http://localhost:4810/api/v1 npx expo export --platform web --output-dir dist-web`,
puis `SHOTS_DIR=/chemin npm run e2e` (le script sert `dist-web` et relaie `/api` vers `localhost:8000`, sans souci de CORS).
Sur le web, la carte native est remplacée par une liste (react-native-maps n'existe que sur mobile) et le jeton reste en mémoire.

## Organisation

- `src/app/` : écrans (expo-router). Onglets `(tabs)/` : Découvrir, Carte, Pépites, Concierge, Moi ; piles : fiche lieu, recherche, Ma soirée, favoris, collections, premium, connexion…
- `src/lib/` : types du contrat, client API (`{detail, code}` → `ApiError.kind`), formatages FCFA/distances, filtres, signaux `POST /events`.
- `src/components/` : design system (tokens dans `src/theme/tokens.ts`), cartes de lieux, feuilles modales, icônes SVG maison.
- Position : demandée uniquement après l'écran de consentement de l'app ; sinon ville + quartier.
- Jeton : `expo-secure-store` (Keychain / Keystore) ; en mémoire sur le web.

## Identifiants et builds de store (plus tard)

- `app.json` : `ios.bundleIdentifier` et `android.package` = `com.sortie.app` (provisoire, à remplacer par le vrai domaine inversé avant toute publication), `scheme: sortie`.
- Builds avec EAS (compte Expo requis) :
  ```bash
  npx eas-cli@latest login
  npx eas-cli@latest build:configure          # crée eas.json
  npx eas-cli@latest build -p android --profile preview   # APK installable
  npx eas-cli@latest build -p ios --profile preview       # nécessite un compte Apple Developer
  ```
- Avant les stores : icône et écran de démarrage définitifs (`assets/`), clé Google Maps Android (`android.config.googleMaps.apiKey`) pour la carte en build autonome, URL d'API de production dans les variables EAS, politique de confidentialité (position, export, suppression de compte).
