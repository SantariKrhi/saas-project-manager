# SaaS Project Manager

Outil de gestion de projet multi-entreprises (type Trello / ClickUp) basé sur MongoDB.

## Lancement

Prérequis : Docker et Docker Compose uniquement.

```bash
docker compose up -d --build
```

- Interface web : http://localhost:3000
- API : http://localhost:3000/api (santé : `/api/health`)

## Configuration

Les valeurs par défaut fonctionnent sans rien faire. Pour les changer, copier `.env.example` en `.env`.

| Variable | Rôle | Défaut |
|---|---|---|
| `MONGO_URI` | URI de connexion MongoDB (replica set, mongos...) | `mongodb://mongo:27017/saas` |
| `MONGO_DB` | Nom de la base | `saas` |
| `JWT_SECRET` | Secret de signature des tokens | `dev-secret-change-me` |
| `ACTIVITY_TTL_DAYS` | Conservation du journal d'activité (index TTL) | `90` |
| `APP_PORT` | Port exposé sur la machine | `3000` |

## Réinitialiser la base

```bash
docker compose down -v
```

## Documentation

- `docs/spec-technique.md` : architecture de la base et structures JSON
- `docs/spec-fonctionnelle.md` : fonctionnalités

## Comptes de démo

Mot de passe commun : `demo1234`

| Entreprise (slug) | Admin | Membre |
|---|---|---|
| `acme` | admin@acme.test | bob@acme.test, chloe@acme.test |
| `globex` | admin@globex.test | bob@globex.test, chloe@globex.test |

```bash
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json"   -d '{"company":"acme","email":"admin@acme.test","password":"demo1234"}'
```

## API

Toutes les routes (sauf `/api/health` et `/api/auth/*`) exigent `Authorization: Bearer <token>`.
L'entreprise est déduite du token : elle n'est jamais lue dans le body ni l'URL.
Une ressource d'une autre entreprise (ou d'un projet dont on n'est pas membre) répond **404**.

| Route | Rôle requis |
|---|---|
| `POST /api/auth/register-company`, `POST /api/auth/login`, `GET /api/auth/me` | public / connecté |
| `GET /api/company`, `PATCH /api/company`, `DELETE /api/company` (body `{confirm: slug}`) | connecté / admin |
| `GET /api/users`, `GET /api/users/:id` | connecté |
| `POST /api/users`, `PATCH /api/users/:id`, `DELETE /api/users/:id` | admin |
| `GET /api/projects`, `GET /api/projects/:id` | connecté (membre : ses projets) |
| `POST /api/projects`, `PATCH /api/projects/:id`, `PUT /api/projects/:id/members`, `DELETE /api/projects/:id` | admin |
| `GET /api/projects/:id/board` (filtres `assigneeId`, `priority`) | membre du projet / admin |
| `GET/POST /api/projects/:id/tasks` | membre du projet / admin |
| `GET/PATCH/DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/move`, `POST /api/tasks/:id/comments` | membre du projet / admin |
| `POST/PATCH/DELETE /api/tasks/:id/checklist[/:itemId]` | membre du projet / admin |
| `POST /api/tasks/:id/attachments`, `GET /api/attachments/:fileId`, `DELETE /api/tasks/:id/attachments/:fileId` | membre du projet / admin |
| `GET /api/projects/:id/activity` (pagination `?before=`) | membre du projet / admin |
| `GET /api/me/tasks`, `GET /api/stats[?projectId=]`, `GET /api/search?q=` | connecté (projets visibles) |

## Tests

Avec l'application démarrée (Node 18+ sur la machine, facultatif) :

```bash
node tests/smoke.js
```

## Fonctionnalités

- Entreprises, utilisateurs (admin / membre), projets, tâches, avec isolation stricte entre entreprises
- Kanban en glisser-déposer, colonnes personnalisables, priorité, échéance, étiquettes, commentaires
- Checklist dans les tâches, pièces jointes (stockées dans MongoDB via GridFS)
- Calendrier des échéances, vue « Mes tâches », journal d'activité (purgé par index TTL)
- Tableau de bord statistique (aggregation pipeline)
- Recherche plein texte en français (index texte MongoDB, raccourci « / »)
- Thème clair / sombre, interface adaptée au mobile

Détails : `docs/spec-fonctionnelle.md` et `docs/spec-technique.md` (§ 11 : fonctionnalités avancées MongoDB).
