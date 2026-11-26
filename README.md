# SaaS Project Manager

Outil de gestion de projet multi-entreprises (type Trello / ClickUp) basé sur MongoDB.

Projet réalisé en binôme par Louka Carpentier et Elias Aïssou--Douspis - module R5.10 Nouveau paradigme de base de données.

- Entreprises, utilisateurs (admin / membre), projets, tâches, avec isolation stricte entre entreprises
- Kanban en glisser-déposer, colonnes personnalisables, priorité, échéance, étiquettes, commentaires
- Checklist dans les tâches, pièces jointes (stockées dans MongoDB via GridFS)
- Calendrier des échéances, vue « Mes tâches », journal d'activité (purgé par index TTL)
- Tableau de bord statistique (pipeline d'agrégation MongoDB), recherche plein texte en français (raccourci « / »)
- Thème clair / sombre, interface adaptée au mobile

## Lancement

Prérequis : Docker et Docker Compose uniquement.

```bash
docker compose up -d --build
```

- Interface web : http://localhost:3000
- API : http://localhost:3000/api (santé : `/api/health`)

Au premier démarrage, un jeu de données de démo est inséré. Remise à zéro : `docker compose down -v`.

## Comptes de démo

Mot de passe commun : `demo1234`. Deux entreprises permettent de vérifier l'isolation.

| Entreprise (slug) | Admin | Membres |
|---|---|---|
| `acme` | admin@acme.test | bob@acme.test, chloe@acme.test |
| `globex` | admin@globex.test | bob@globex.test, chloe@globex.test |

Exemple d'appel à l'API :

```bash
curl -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"company":"acme","email":"admin@acme.test","password":"demo1234"}'
```

Le token renvoyé s'utilise dans l'en-tête `Authorization: Bearer <token>` (routes regroupées par ressource dans `app/src/routes/`).

## Configuration

Les valeurs par défaut fonctionnent sans rien faire. Pour les changer, copier `.env.example` en `.env`.

| Variable | Rôle | Défaut |
|---|---|---|
| `MONGO_URI` | URI de connexion MongoDB (replica set, mongos...) | `mongodb://mongo:27017/saas` |
| `MONGO_DB` | Nom de la base | `saas` |
| `JWT_SECRET` | Secret de signature des tokens | `dev-secret-change-me` |
| `ACTIVITY_TTL_DAYS` | Conservation du journal d'activité (index TTL) | `90` |
| `APP_PORT` | Port exposé sur la machine | `3000` |

## Tests

Avec l'application démarrée (Node 18+ sur la machine, facultatif) :

```bash
node tests/smoke.js
```

Tests de l'API : isolation entre entreprises, droits, Kanban, cascades, checklist, pièces jointes, recherche.

## Documentation

Les spécifications sont en PDF dans `docs/`. Les fichiers Word du même nom en sont les sources modifiables.

- [Spécification fonctionnelle](docs/spec-fonctionnelle.pdf) : rôles, besoins, fonctionnalités (obligatoires et additionnelles), règles de gestion, écrans, exigences non fonctionnelles
- [Spécification technique](docs/spec-technique.pdf) : architecture, structures JSON, index, isolation, API, préparation à la réplication et au sharding, fonctionnalités avancées MongoDB
