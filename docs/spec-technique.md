# Spécification technique

Application SaaS multi-entreprises de gestion de projet (entreprises, utilisateurs, projets, tâches, Kanban).
Ce document décrit l'architecture, le modèle de données MongoDB (structures JSON), l'isolation entre entreprises
et la préparation à la réplication / au sharding (Partie II du TD).

## 1. Architecture

```
Navigateur ──HTTP──▶ app (Node 20 + Express 5) ──driver MongoDB──▶ mongo (MongoDB 7)
                      │ sert l'API REST (/api) et l'interface statique (/)
                      └ MONGO_URI, MONGO_DB, JWT_SECRET, PORT : variables d'environnement
```

| Élément | Choix |
|---|---|
| Base | MongoDB 7, base `saas`, 4 collections |
| Back | Node.js 20, Express 5, driver officiel `mongodb` 6 (pas d'ODM : le modèle est explicite) |
| Auth | JWT (HS256, 8 h) + mots de passe hachés `bcryptjs` |
| Front | HTML / CSS / JS sans framework ni build, servi par Express, Kanban en drag & drop natif (HTML5) |
| Déploiement | `docker compose up -d --build` : services `mongo` (healthcheck) et `app` (`depends_on: service_healthy`) |

Organisation du code (`app/src`) :

| Dossier | Rôle |
|---|---|
| `config.js`, `db.js` | Configuration par variables d'environnement ; connexion avec retry |
| `repositories/index.js` | **Seul** accès aux collections métier ; chaque repository est lié à un `companyId` |
| `middleware/auth.js` | Vérification du JWT, chargement du rôle, `requireAdmin` |
| `lib/access.js`, `lib/http.js` | Contrôle d'accès aux projets, erreurs HTTP, validation des identifiants |
| `routes/*.js` | `auth`, `company`, `users`, `projects`, `tasks` (+ board Kanban) |
| `seed.js` | Jeu de données de démo (uniquement si la base est vide) |
| `public/` | Interface web |

## 2. Modèle de données

Principe : **une collection par entité, liées par références (`ObjectId`)**, et un champ `companyId` présent dans
**chaque** document métier. Les types sont imposés par un validator `$jsonSchema` (`mongo-init/init.js`).

### 2.1 `companies`

```json
{
  "_id": { "$oid": "6ad10539b1611e3d4b131eba" },
  "name": "Acme",
  "slug": "acme",
  "plan": "free",
  "createdAt": { "$date": "2026-10-15T09:00:00Z" }
}
```

`slug` : identifiant unique, minuscules/chiffres/tirets, dérivé du nom ; sert à la connexion.
`plan` : `free` | `pro` (prévu pour une offre payante, non exploité).

### 2.2 `users`

```json
{
  "_id": { "$oid": "6ad10539b1611e3d4b131ebb" },
  "companyId": { "$oid": "6ad10539b1611e3d4b131eba" },
  "email": "admin@acme.test",
  "passwordHash": "$2a$10$...",
  "firstName": "Alice",
  "lastName": "Acme",
  "role": "admin",
  "createdAt": { "$date": "2026-10-15T09:00:00Z" }
}
```

`role` : `admin` | `member`. `passwordHash` n'est jamais renvoyé par l'API (projection `{ passwordHash: 0 }`).
L'email est stocké en minuscules et n'est unique **qu'au sein d'une entreprise**.

### 2.3 `projects`

```json
{
  "_id": { "$oid": "6ad10539b1611e3d4b131ebc" },
  "companyId": { "$oid": "6ad10539b1611e3d4b131eba" },
  "name": "Refonte du site",
  "description": "Nouvelle version du site vitrine",
  "memberIds": [{ "$oid": "6ad10539b1611e3d4b131ebb" }, { "$oid": "6ad10539b1611e3d4b131ebd" }],
  "columns": ["todo", "doing", "review", "done"],
  "createdBy": { "$oid": "6ad10539b1611e3d4b131ebb" },
  "createdAt": { "$date": "2026-10-15T09:00:00Z" }
}
```

`columns` définit les colonnes du Kanban, dans l'ordre (la dernière est la colonne « terminé » : une tâche
datée y échappe au statut « en retard »). `memberIds` : utilisateurs assignés au projet.

### 2.4 `tasks`

```json
{
  "_id": { "$oid": "6ad10539b1611e3d4b131ebe" },
  "companyId": { "$oid": "6ad10539b1611e3d4b131eba" },
  "projectId": { "$oid": "6ad10539b1611e3d4b131ebc" },
  "title": "Développer la page de login",
  "description": "",
  "status": "doing",
  "position": 2048,
  "assigneeId": { "$oid": "6ad10539b1611e3d4b131ebd" },
  "priority": "medium",
  "dueDate": { "$date": "2026-11-01T00:00:00Z" },
  "labels": ["front", "urgent"],
  "comments": [
    { "userId": { "$oid": "6ad10539b1611e3d4b131ebb" }, "text": "À finir pour jeudi", "at": { "$date": "2026-10-15T10:30:00Z" } }
  ],
  "createdAt": { "$date": "2026-10-15T09:00:00Z" },
  "updatedAt": { "$date": "2026-10-15T10:30:00Z" }
}
```

| Champ | Règle |
|---|---|
| `status` | Doit appartenir à `project.columns` (contrôlé par l'API) |
| `position` | Nombre ; ordre dans la colonne. Insertion entre deux cartes = moyenne de leurs positions (pas de renumérotation) ; en fin de colonne = dernière + 1024 |
| `assigneeId` | `null` ou membre du projet (même entreprise) |
| `priority` | `low` \| `medium` \| `high` |
| `dueDate` | `null` ou date |

### 2.5 Relations

```
companies 1 ──── * users
companies 1 ──── * projects ── * ──┐ (projects.memberIds)
companies 1 ──── * tasks           └── users
projects  1 ──── * tasks      tasks.assigneeId ──▶ users
```

## 3. Choix de modélisation : références ou imbrication

| Donnée | Choix | Justification |
|---|---|---|
| Tâches | **Collection séparée**, référence `projectId` | Nombre non borné, modifiées très souvent (déplacements Kanban) : les imbriquer dans `projects` ferait croître un document sans limite (16 Mo) et réécrirait un gros document à chaque déplacement. Permet aussi d'indexer et de requêter les tâches seules |
| Membres d'un projet | **Tableau de références** `memberIds` dans le projet | Nombre borné et faible ; lecture « membres d'un projet » en un seul accès ; un utilisateur appartient à plusieurs projets (relation n-n sans collection de liaison) |
| Commentaires | **Imbriqués** dans la tâche | Peu nombreux, toujours lus avec la tâche, jamais requêtés seuls |
| Colonnes du Kanban | **Imbriquées** dans le projet | Configuration propre au projet, de petite taille |
| Étiquettes | Tableau de chaînes dans la tâche | Libres, pas de gestion centralisée nécessaire |
| `companyId` | **Dénormalisé** dans chaque document (y compris les tâches) | Isolation et filtrage sans jointure ; clé de sharding naturelle |

Contrepartie assumée : pas de contraintes référentielles. Elles sont assurées par l'application (section 6).

## 4. Index

| Collection | Index | Rôle |
|---|---|---|
| `companies` | `{ slug: 1 }` **unique** | Connexion par identifiant d'entreprise, unicité |
| `users` | `{ companyId: 1, email: 1 }` **unique** | Unicité de l'email par entreprise ; recherche au login |
| `projects` | `{ companyId: 1, _id: 1 }` | Accès à un projet d'une entreprise ; listes par entreprise |
| `tasks` | `{ companyId: 1, projectId: 1, status: 1, position: 1 }` | Board Kanban : tâches d'un projet, par colonne, triées |

`companyId` est toujours le **préfixe** des index : les requêtes sont ciblées sur une entreprise et l'index
reste utilisable tel quel en environnement shardé. Un index `_id` implicite existe sur chaque collection.

## 5. Isolation entre entreprises (multi-tenant)

Isolation logicielle stricte, en défense en profondeur :

1. **Le `companyId` vient uniquement du JWT signé** (`req.auth.companyId`). Il n'est jamais lu dans le corps, l'URL
   ou les paramètres : un `companyId` envoyé dans un body est ignoré.
2. **Repositories liés à une entreprise** : `forCompany(db, companyId)` renvoie des fonctions qui injectent
   `companyId` dans chaque filtre (`find`, `findOne`, `update*`, `delete*`), placé en dernier dans l'objet de filtre
   pour ne pas pouvoir être écrasé. Les routes n'appellent jamais `db.collection()` directement.
3. **Lectures croisées impossibles par construction** : un identifiant d'une autre entreprise ne correspond à aucun
   document du périmètre → réponse **404** (et non 403) : l'existence de la ressource n'est pas révélée.
4. **Références validées** : membres d'un projet et assigné d'une tâche doivent exister dans l'entreprise courante
   (et dans le projet pour l'assigné).
5. **Utilisateur relu en base à chaque requête** (`requireAuth`) : un utilisateur supprimé perd l'accès
   immédiatement et un changement de rôle est effectif tout de suite (le rôle n'est pas lu dans le token).
6. **Tests automatisés** (`tests/smoke.js`) : 404 sur lecture, modification, déplacement et suppression
   inter-entreprises, `companyId` du body ignoré, assignation inter-entreprises refusée.

## 6. Intégrité et suppressions en cascade

MongoDB n'impose pas de clés étrangères ; l'application s'en charge (`repositories/index.js`) :

| Suppression | Effet |
|---|---|
| Utilisateur | Retiré de `projects.memberIds` ; `assigneeId` mis à `null` sur ses tâches |
| Retrait d'un membre d'un projet | Ses tâches dans ce projet sont désassignées |
| Projet | Toutes ses tâches sont supprimées |
| Entreprise | Tâches, projets, utilisateurs puis l'entreprise (confirmation par le slug) |
| Colonne d'un projet | Refusée (409) si elle contient encore des tâches |
| Renommage d'une colonne | Ses tâches suivent (`renamedColumns: [{ from, to }]`), y compris l'échange de deux noms ; fusion dans une colonne existante refusée (400) |

Garde-fous : on ne peut pas supprimer son propre compte ni retirer le dernier administrateur.
Ces opérations multiples ne sont **pas transactionnelles** (instance MongoDB seule) ; en Partie II, avec un
replica set, elles pourront être regroupées dans une transaction (`session.withTransaction`).

## 7. API REST

Préfixe `/api`, JSON. Authentification : `Authorization: Bearer <JWT>` sauf `/health` et `/auth/login|register-company`.

| Méthode et route | Rôle | Description |
|---|---|---|
| `GET /health` | public | Ping MongoDB |
| `POST /auth/register-company` | public | Crée entreprise + premier admin, renvoie un token |
| `POST /auth/login` | public | Corps : `company` (slug), `email`, `password` |
| `GET /auth/me` | connecté | Profil courant |
| `GET` / `PATCH` / `DELETE /company` | connecté / admin / admin | Entreprise courante (`DELETE` : `{ "confirm": "<slug>" }`) |
| `GET /users`, `GET /users/:id` | connecté | Utilisateurs de l'entreprise |
| `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` | admin | Gestion des utilisateurs |
| `GET /projects`, `GET /projects/:id` | connecté | Admin : tous ; membre : ses projets |
| `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id` | admin | Gestion des projets (`PATCH` accepte `renamedColumns` pour renommer des colonnes sans perdre leurs tâches) |
| `PUT /projects/:id/members` | admin | Remplace la liste `memberIds` |
| `GET /projects/:id/board` | membre / admin | Tâches groupées par colonne ; filtres `assigneeId`, `priority` |
| `GET`, `POST /projects/:id/tasks` | membre / admin | Liste, création |
| `GET`, `PATCH`, `DELETE /tasks/:id` | membre / admin | Une tâche |
| `PATCH /tasks/:id/move` | membre / admin | `{ status, position? }` : déplacement Kanban |
| `POST /tasks/:id/comments` | membre / admin | `{ text }` |

Codes : `400` validation, `401` non authentifié, `403` rôle insuffisant, `404` introuvable ou hors périmètre,
`409` conflit (email, slug, colonne non vide, dernier admin).

## 8. Configuration et déploiement

| Variable | Défaut | Rôle |
|---|---|---|
| `MONGO_URI` | `mongodb://mongo:27017/saas` | **Connexion MongoDB, seul point à modifier pour changer de topologie** |
| `MONGO_DB` | `saas` | Nom de la base |
| `JWT_SECRET` | `dev-secret-change-me` | Secret de signature (à changer en production) |
| `PORT` / `APP_PORT` | `3000` | Port de l'app / port exposé |

Aucune adresse ni option de connexion n'est écrite en dur : tout passe par `MONGO_URI` (lue dans `config.js`,
utilisée telle quelle par `MongoClient`). `db.js` réessaie la connexion 10 fois (2 s d'intervalle).
Le script `mongo-init/init.js` (validators + index) s'exécute au premier démarrage du volume ; le seed de démo
est inséré par l'application si la base est vide. Remise à zéro : `docker compose down -v`.

## 9. Préparation à la réplication et au sharding (Partie II)

**Connexion.** Il suffit de changer `MONGO_URI`, sans toucher au code :

```
# Replica set
mongodb://m1:27017,m2:27017,m3:27017/saas?replicaSet=rs0&w=majority&readPreference=primaryPreferred
# Cluster shardé (via le routeur mongos)
mongodb://mongos1:27017,mongos2:27017/saas
```

**Clé de sharding proposée** (le `companyId` est présent partout et dans toutes les requêtes) :

| Collection | Clé | Justification |
|---|---|---|
| `tasks` | `{ companyId: 1, projectId: 1 }` (ou `{ companyId: "hashed" }` si une entreprise très volumineuse crée des « hot shards ») | Un board Kanban ne touche qu'une entreprise et un projet : requête **ciblée sur un seul shard** |
| `projects` | `{ companyId: 1, _id: 1 }` | Idem, répartition fine |
| `users` | `{ companyId: 1, email: 1 }` | L'index unique `{ companyId, email }` doit **contenir la clé de sharding** (contrainte MongoDB) ; une clé hashée ne le permet pas |
| `companies` | non shardée | Très petite collection, accès par `_id` ou `slug` |

Points d'attention déjà traités : toutes les requêtes applicatives incluent `companyId` (pas de scatter-gather),
les index commencent par `companyId`, l'unicité de l'email est par entreprise. À vérifier en Partie II : activer
`sh.shardCollection` après création des index, l'unicité de `slug` (collection non shardée, donc inchangée),
et l'usage de transactions pour les cascades (section 6).

## 10. Limites connues

- Pas de réinitialisation de mot de passe ni de vérification d'email.
- JWT de 8 h, sans liste de révocation (la suppression/modification de l'utilisateur est toutefois prise en compte immédiatement, cf. §5.5).
- Cascades non transactionnelles tant que MongoDB est en instance seule.
- Positions des cartes en nombres flottants : après un très grand nombre d'insertions successives au même endroit,
  une renumérotation de la colonne deviendrait nécessaire (non implémentée).
- Pas de limitation de débit (rate limiting) sur le login.
