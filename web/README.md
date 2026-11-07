# Frontend web (Next.js 15)

Concierge de sorties à Abidjan. Nom de code configurable via `NEXT_PUBLIC_APP_NAME` (défaut « Sortie », centralisé dans `src/lib/config.ts`).

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_APP_NAME
npm install
npm run dev                  # http://localhost:3000
npm run build && npm start   # production
npm run lint                 # ESLint (0 avertissement toléré)
npm test                     # Vitest + Testing Library
```

Smoke test E2E (hors `npm test`, nécessite le front sur :3000 et l'API avec les données de démo) :

```bash
SHOTS_DIR=/tmp/shots node e2e/smoke.mjs   # STUB_TILES=0 pour charger les vraies tuiles OSM
```

Structure : `src/app` (écrans), `src/components`, `src/context` (auth, méta, position, toasts),
`src/lib` (client API typé `api.ts`, types du contrat `types.ts`, formatage, filtres ⇄ URL),
`src/styles/tokens.css` (design system).
