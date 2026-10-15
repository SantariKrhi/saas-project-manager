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

## État d'avancement

Squelette : API `/api/health`, connexion MongoDB configurable, init des collections et index.
