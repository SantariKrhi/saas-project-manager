# SaaS Project Manager

Outil de gestion de projet multi-entreprises (type Trello / ClickUp) basé sur MongoDB.

## Lancement

Prérequis : Docker et Docker Compose uniquement.

```bash
docker compose up -d --build
```

- API : http://localhost:3000/api/health

## Configuration

Les valeurs par défaut fonctionnent sans rien faire. Pour les changer, copier `.env.example` en `.env`.

| Variable | Rôle | Défaut |
|---|---|---|
| `MONGO_URI` | URI de connexion MongoDB (replica set, mongos...) | `mongodb://mongo:27017/saas` |
| `MONGO_DB` | Nom de la base | `saas` |
| `JWT_SECRET` | Secret de signature des tokens | `dev-secret-change-me` |
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
| `acme` | admin@acme.test | bob@acme.test |
| `globex` | admin@globex.test | bob@globex.test |

```bash
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json"   -d '{"company":"acme","email":"admin@acme.test","password":"demo1234"}'
```

## État d'avancement

Fait : connexion MongoDB configurable, validators et index, seed de démo, authentification JWT
(`/api/auth/register-company`, `/login`, `/me`).
À faire : CRUD utilisateurs / projets / tâches, Kanban, spécifications.
