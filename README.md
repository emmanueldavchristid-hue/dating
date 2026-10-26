# Sortie — conciergerie de sorties (nom de code)

Application premium de découverte de lieux de sortie et de détente, lancée à Abidjan : recherche géolocalisée multicritère,
recommandations explicables, carte, fiches détaillées, favoris, itinéraires de soirée, concierge, pépites premium et administration.

> **Nom de code.** « Sortie » est provisoire : côté interface, il se change via `NEXT_PUBLIC_APP_NAME` (web), côté API via `APP_NAME` (backend).
> Le dépôt s'appelle `dating` pour l'instant ; ce n'est **pas** une application de rencontres.

## Architecture

```
web/        Next.js 15 + React 19 + TypeScript — application web responsive (mobile d'abord)
backend/    FastAPI + SQLAlchemy 2 + Alembic — API REST /api/v1
infra/db/   Image PostgreSQL 16 + PostGIS + pgvector
docs/       API.md (contrat), DATABASE.md (schéma), DECISIONS.md
```

Choix du frontend : une application web responsive en Next.js permet d'obtenir tout de suite un MVP exécutable, testable
et démontrable sur téléphone comme sur ordinateur, avec l'administration dans la même base de code. Le contrat d'API
(`docs/API.md`) et le client typé (`web/src/lib/api.ts`, `web/src/lib/types.ts`) sont indépendants de l'interface :
une application Expo (React Native) pourra les réutiliser plus tard.

## Démarrage rapide (Docker)

```bash
git clone https://github.com/emmanueldavchristid-hue/dating && cd dating
cp backend/.env.example backend/.env          # adapter si besoin
docker compose up --build -d                  # base + API (migrations auto) + web
docker compose exec api python -m app.seed --demo   # données de démonstration fictives
```

- Application : http://localhost:3000
- API + documentation interactive : http://localhost:8000/api/docs

## Démarrage sans Docker

Prérequis : Python 3.12+, Node 22+, PostgreSQL 16 avec les extensions PostGIS 3 et pgvector
(Ubuntu : `apt install postgresql-16-postgis-3 postgresql-16-pgvector`).

```bash
# Base
sudo -u postgres psql -c "CREATE USER sortie WITH PASSWORD 'sortie' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE sortie OWNER sortie;" -c "CREATE DATABASE sortie_test OWNER sortie;"

# API
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
python -m app.seed --demo
uvicorn app.main:app --reload --port 8000

# Web (autre terminal)
cd web
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

## Comptes de démonstration

Créés par `python -m app.seed --demo` (refusé si `ENVIRONMENT=production`). Mot de passe commun : `Demo-2026!`

| E-mail | Rôle | Offre |
| --- | --- | --- |
| `user@sortie.demo` | utilisateur | Découverte (gratuite) |
| `insider@sortie.demo` | utilisateur | Insider (pépites) |
| `curateur@sortie.demo` | curateur | Découverte |
| `admin@sortie.demo` | administrateur | Insider |

## Tests

```bash
cd backend && pytest -q           # unitaires + intégration sur PostgreSQL réel (base sortie_test, ou TEST_DATABASE_URL)
cd backend && ruff check app tests alembic
cd web && npm test && npm run lint && npm run build
```

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute ces mêmes vérifications à chaque push.

## Tâches planifiées

```bash
python -m app.tasks purge-history     # supprime l'historique de recherche au-delà de SEARCH_HISTORY_RETENTION_DAYS
python -m app.tasks flag-for-review   # file de curation : lieux non vérifiés depuis 1 an, signalements multiples
```

À brancher sur un cron (une fois par jour suffit).

## Intégrations (toutes optionnelles)

L'application fonctionne sans aucune clé externe. Chaque intégration passe par un adaptateur dans `backend/app/adapters/`.

| Variable | Effet | Sans configuration |
| --- | --- | --- |
| `ROUTING_PROVIDER=osrm` + `OSRM_URL` | Temps de trajet réels sur les cartes et fiches | Seule la distance **à vol d'oiseau** est affichée |
| `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` | Le concierge comprend et rédige avec l'IA, à partir des lieux de la base uniquement | Concierge en **mode règles** (déterministe) |
| `MEDIA_BASE_URL` | Photos servies depuis un bucket S3 / CDN | Visuels d'ambiance générés (dégradés) |
| `PAYMENTS_PROVIDER` | Abonnements payants via un agrégateur Mobile Money | Paiement affiché comme « bientôt disponible », **aucune transaction simulée** |
| Carte | Tuiles OpenStreetMap (attribution affichée) | Mode liste si les tuiles ne se chargent pas |

## Sécurité et vie privée

- Secrets uniquement dans `.env` (jamais commité) ; `JWT_SECRET` obligatoire en production.
- Mots de passe Argon2id, JWT à durée limitée, contrôle des rôles côté serveur (`/admin/*`), droits premium vérifiés par l'API.
- Limitation de débit (connexion, recherche, concierge, écritures), validation stricte des entrées, erreurs au format `{detail, code}`.
- Géolocalisation uniquement après consentement explicite ; historique de recherche arrondi à ~1 km et purgé.
- Export (`GET /me/export`) et suppression (`DELETE /me`) des données personnelles.

Voir `PROGRESS.md` pour l'état exact du projet : ce qui est fait, ce qui est simulé et ce qui reste à faire.
