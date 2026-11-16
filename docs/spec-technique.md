# Spécification technique

Application SaaS multi-entreprises de gestion de projet (entreprises, utilisateurs, projets, tâches, Kanban).
Ce document décrit l'architecture, le modèle de données MongoDB (structures JSON), l'isolation entre entreprises
et la préparation à la réplication et au sharding (Partie II du TD).

## 1. Architecture

Navigateur → app (Node 20 + Express 5) → mongo (MongoDB 7). Le conteneur `app` sert l'API REST (sous `/api`) et
l'interface web, et accède à la base par le driver officiel. Connexion et secrets sont fournis par les variables
d'environnement (`MONGO_URI`, `MONGO_DB`, `JWT_SECRET`, `ACTIVITY_TTL_DAYS`).

| Élément | Choix |
|---|---|
| Base | MongoDB 7, base `saas`, 5 collections métier + 2 collections GridFS (pièces jointes) |
| Back | Node.js 20, Express 5, driver officiel `mongodb` 6 (pas d'ODM, le modèle est explicite) |
| Auth | JWT (HS256, 8 h) + mots de passe hachés `bcryptjs` |
| Front | HTML / CSS / JS sans framework ni build, servi par Express, Kanban en drag et drop natif (HTML5) |
| Déploiement | `docker compose up -d --build`, services `mongo` (healthcheck) et `app` (`depends_on: service_healthy`) |

L'accès aux données passe par une couche unique, liée à l'entreprise connectée. Les validators et les index sont
créés par l'application à son démarrage.

## 2. Modèle de données

Principe retenu, une collection par entité, liées par références (ObjectId), avec un champ companyId présent
dans chaque document métier. Les types sont imposés par un validator `$jsonSchema` sur chaque collection. Dans les exemples, `$oid` désigne un
identifiant ObjectId et `$date` une date, selon la notation JSON de MongoDB.

### 2.1 `companies`

```json
{
  "_id": { "$oid": "6ad10539b1611e3d4b131eba" },
  "name": "Acme",
  "slug": "acme",
  "createdAt": { "$date": "2026-10-15T09:00:00Z" }
}
```

`slug` est l'identifiant unique de l'entreprise (minuscules, chiffres, tirets), dérivé du nom. Il sert à la connexion.

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

`role` vaut `admin` ou `member`. `passwordHash` n'est jamais renvoyé par l'API.
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
  "createdAt": { "$date": "2026-10-15T09:00:00Z" }
}
```

`columns` définit les colonnes du Kanban, dans l'ordre. La dernière est la colonne « terminé », une tâche datée
y échappe au statut « en retard ». `memberIds` liste les utilisateurs assignés au projet.

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
    { "userId": { "$oid": "6ad10539b1611e3d4b131ebb" }, "text": "À finir pour jeudi",
      "at": { "$date": "2026-10-15T10:30:00Z" } }
  ],
  "checklist": [
    { "_id": { "$oid": "6ad10539b1611e3d4b131ec1" }, "text": "Formulaire", "done": true },
    { "_id": { "$oid": "6ad10539b1611e3d4b131ec2" }, "text": "Messages d'erreur", "done": false }
  ],
  "attachments": [
    { "_id": { "$oid": "6ad10539b1611e3d4b131ec3" }, "name": "maquette.png", "size": 48213,
      "contentType": "image/png", "uploadedBy": { "$oid": "6ad10539b1611e3d4b131ebd" },
      "at": { "$date": "2026-10-16T14:00:00Z" } }
  ],
  "completedAt": null,
  "createdAt": { "$date": "2026-10-15T09:00:00Z" },
  "updatedAt": { "$date": "2026-10-15T10:30:00Z" }
}
```

| Champ | Règle |
|---|---|
| `status` | Doit appartenir à `project.columns` (contrôlé par l'API) |
| `position` | Ordre dans la colonne. Une carte insérée entre deux autres prend la moyenne de leurs positions, ce qui évite de renuméroter la colonne |
| `dueDate` | `null` ou date, stockée à minuit UTC car c'est une date de calendrier |
| `completedAt` | Posée quand la tâche arrive dans la dernière colonne et remise à `null` si elle en ressort. Sert aux statistiques |

### 2.5 `activities` (journal d'activité)

```json
{
  "_id": { "$oid": "6ad10539b1611e3d4b131ed0" },
  "companyId": { "$oid": "6ad10539b1611e3d4b131eba" },
  "projectId": { "$oid": "6ad10539b1611e3d4b131ebc" },
  "userId": { "$oid": "6ad10539b1611e3d4b131ebd" },
  "type": "task.moved",
  "data": { "taskId": { "$oid": "6ad10539b1611e3d4b131ebe" }, "title": "Développer la page de login",
            "from": "doing", "to": "review" },
  "at": { "$date": "2026-10-16T09:12:00Z" }
}
```

`type` décrit l'action (création, déplacement, modification ou suppression d'une tâche, commentaire, case de
checklist, pièce jointe, modification d'un projet). `data.title` est une **copie** du titre au moment de l'action.
L'historique reste ainsi lisible même si la tâche est renommée ou supprimée (dénormalisation volontaire).

### 2.6 `attachments.files` et `attachments.chunks` (GridFS)

Ces collections sont gérées par le driver (`GridFSBucket`, bucket `attachments`). Le fichier est découpé en morceaux
de 255 Ko dans `attachments.chunks`. `attachments.files` porte son nom, sa taille et un champ `metadata` (`companyId`,
`projectId`, `taskId`, `contentType`, `uploadedBy`) qui sert à l'isolation et aux suppressions en cascade.

### 2.7 Relations

| Relation | Cardinalité | Portée par |
|---|---|---|
| Entreprise → utilisateurs, projets, tâches, activités | 1 – n | `companyId` dans chaque document |
| Projet → tâches | 1 – n | `tasks.projectId` |
| Projet ↔ utilisateurs (membres) | n – n | `projects.memberIds` |
| Tâche → utilisateur assigné | n – 0..1 | `tasks.assigneeId` |
| Projet → activités | 1 – n | `activities.projectId` |
| Tâche → fichiers GridFS | 1 – n | `attachments.files.metadata.taskId` |

## 3. Choix de modélisation (références ou imbrication)

| Donnée | Choix | Justification |
|---|---|---|
| Tâches | **Collection séparée**, référence `projectId` | Nombre non borné et déplacements très fréquents. Imbriquées dans `projects`, elles feraient grossir un document sans limite (16 Mo) réécrit à chaque déplacement. Elles peuvent aussi être indexées et requêtées seules |
| Membres d'un projet | **Tableau de références** `memberIds` dans le projet | Peu nombreux et lus en un seul accès. Relation n-n sans collection de liaison |
| Commentaires | **Imbriqués** dans la tâche | Peu nombreux, toujours lus avec la tâche, jamais requêtés seuls |
| Checklist | **Imbriquée** dans la tâche (50 éléments max.) | Toujours lue avec la tâche. Chaque élément a un `_id` pour être modifié seul avec `arrayFilters` |
| Pièces jointes | Métadonnées **imbriquées** + contenu dans **GridFS** | Liste affichée avec la tâche sans requête de plus, binaire (10 Mo max.) hors du document tâche |
| Journal d'activité | **Collection séparée** | Volume non borné, lu par page et purgé par TTL, ce qu'un tableau imbriqué ne permet pas |
| Colonnes du Kanban | **Imbriquées** dans le projet | Configuration propre au projet, de petite taille |
| Étiquettes | Tableau de chaînes dans la tâche | Libres, pas de gestion centralisée nécessaire |
| `companyId` | **Dénormalisé** dans chaque document (y compris les tâches) | Isolation et filtrage sans jointure, et clé de sharding naturelle |

Contrepartie assumée, il n'y a pas de contraintes référentielles. Elles sont assurées par l'application (section 6).

## 4. Index

| Collection | Index | Rôle |
|---|---|---|
| `companies` | `{ slug: 1 }` **unique** | Connexion par identifiant d'entreprise, unicité |
| `users` | `{ companyId: 1, email: 1 }` **unique** | Unicité de l'email par entreprise, recherche au login |
| `projects` | `{ companyId: 1, _id: 1 }` | Accès à un projet d'une entreprise, listes par entreprise |
| `projects` | `{ companyId: 1, memberIds: 1 }` | Projets d'un membre (index multiclé sur le tableau) |
| `tasks` | `{ companyId: 1, projectId: 1, status: 1, position: 1 }` | Board Kanban (tâches d'un projet, par colonne, triées) |
| `tasks` | `{ companyId: 1, assigneeId: 1, dueDate: 1 }` | « Mes tâches » (tâches d'une personne par échéance) |
| `tasks` | `{ companyId: 1, projectId: 1, dueDate: 1 }` | Calendrier (échéances d'un projet sur une plage de dates) |
| `tasks` | `{ companyId: 1, title: "text", labels: "text", description: "text", "checklist.text": "text", "comments.text": "text" }` (français, pondéré) | Recherche plein texte |
| `activities` | `{ companyId: 1, projectId: 1, at: -1 }` | Journal d'un projet, du plus récent au plus ancien |
| `activities` | `{ at: 1 }` **TTL** (`expireAfterSeconds` = 90 jours) | Purge automatique des entrées anciennes |
| `attachments.files` | `{ "metadata.companyId": 1, "metadata.taskId": 1 }` | Fichiers d'une tâche (suppressions en cascade) |

`companyId` est toujours le **préfixe** des index. Les requêtes sont donc ciblées sur une entreprise, et l'index
reste utilisable tel quel en environnement shardé. Un index `_id` implicite existe sur chaque collection.

Validators et index sont appliqués **par l'application à chaque démarrage**. Ils existent donc aussi sur une base
déjà remplie.

Chaque requête fréquente (board, mes tâches, calendrier, journal, pièces jointes, recherche) dispose de son index, et
aucune ne doit parcourir une collection entière (`COLLSCAN`). Les plans d'exécution seront contrôlés avec `explain()`.

## 5. Isolation entre entreprises (multi-tenant)

L'isolation logicielle est stricte et repose sur plusieurs protections complémentaires (défense en profondeur).

1. **Le `companyId` vient uniquement du JWT signé.** Il n'est jamais lu dans le corps, l'URL ou les paramètres d'une
   requête, et un `companyId` envoyé par le client est ignoré.
2. **Accès aux données lié à l'entreprise.** Toutes les requêtes passent par une couche d'accès qui ajoute le
   `companyId` à chaque filtre, et le reste de l'application n'accède jamais directement aux collections. Seules la
   connexion et l'inscription y échappent, car l'entreprise n'est pas encore connue.
3. **Lectures croisées impossibles par construction.** Un identifiant d'une autre entreprise ne correspond à aucun
   document du périmètre. La réponse est **404** (et non 403), l'existence de la ressource n'est donc pas révélée.
4. **Références validées.** Les membres d'un projet et l'assigné d'une tâche doivent exister dans l'entreprise courante
   (et dans le projet pour l'assigné).
5. **Utilisateur relu en base à chaque requête.** Un utilisateur supprimé perd l'accès immédiatement, et un changement
   de rôle s'applique tout de suite (le rôle n'est pas lu dans le token).

## 6. Intégrité et suppressions en cascade

MongoDB n'impose pas de clés étrangères, l'application s'en charge.

| Suppression | Effet |
|---|---|
| Utilisateur | Retiré de `projects.memberIds`, et `assigneeId` mis à `null` sur ses tâches |
| Retrait d'un membre d'un projet | Ses tâches dans ce projet sont désassignées |
| Tâche | Ses fichiers GridFS sont supprimés |
| Projet | Ses tâches, son journal et ses fichiers GridFS sont supprimés |
| Entreprise | Fichiers, journal, tâches, projets, utilisateurs puis l'entreprise (confirmation par le slug) |
| Colonne d'un projet | Refusée si elle contient encore des tâches |
| Renommage d'une colonne | Ses tâches suivent le nouveau nom, y compris quand deux colonnes échangent leurs noms. La fusion dans une colonne existante est refusée |

Garde-fous, on ne peut pas supprimer son propre compte ni retirer le dernier administrateur.
Ces opérations multiples ne sont **pas transactionnelles** (instance MongoDB seule). En Partie II, avec un replica set,
elles pourront être regroupées dans une transaction.

## 7. API REST

API REST en JSON sous `/api`. Toutes les routes exigent un JWT, sauf `/health`, `/auth/login` et
`/auth/register-company`. L'entreprise est toujours lue dans le token, jamais dans la requête.
Les routes sont regroupées par ressource (authentification, entreprise, utilisateurs, projets, tâches, statistiques).

Codes de retour utilisés : `400` validation, `401` non authentifié, `403` rôle insuffisant, `404` introuvable ou hors
périmètre, `409` conflit (email, slug, colonne non vide, dernier admin).

## 8. Configuration et déploiement

| Variable | Défaut | Rôle |
|---|---|---|
| `MONGO_URI` | `mongodb://mongo:27017/saas` | **Connexion MongoDB, seul point à modifier pour changer de topologie** |
| `MONGO_DB` | `saas` | Nom de la base |
| `JWT_SECRET` | `dev-secret-change-me` | Secret de signature (à changer en production) |
| `ACTIVITY_TTL_DAYS` | `90` | Durée de conservation du journal d'activité (index TTL) |
| `APP_PORT` | `3000` | Port exposé sur la machine (l'app écoute sur 3000 dans son conteneur) |

Aucune adresse n'est écrite en dur, tout passe par `MONGO_URI`. Au démarrage, l'application applique les validators et
les index, puis insère un jeu de démo si la base est vide. Validators et index sont créés par l'application et non par
un script d'initialisation de MongoDB, pour fonctionner de la même façon sur un serveur seul ou sur un cluster.

## 9. Préparation à la réplication et au sharding (Partie II)

**Connexion.** Il suffira de changer `MONGO_URI`, sans toucher au code :

```
# Replica set
mongodb://m1:27017,m2:27017,m3:27017/saas?replicaSet=rs0&w=majority&readPreference=primaryPreferred
# Cluster shardé (via le routeur mongos)
mongodb://mongos1:27017,mongos2:27017/saas
```

Le modèle est prêt à être distribué. `companyId` est présent dans tous les documents, dans toutes les requêtes et
en tête de tous les index. C'est donc le candidat naturel pour la clé de sharding, qui sera choisie et justifiée
en Partie II avec l'architecture du cluster.

## 10. Fonctionnalités avancées MongoDB

### 10.1 Checklist, mise à jour ciblée d'un élément de tableau

Cocher un élément modifie **uniquement** cet élément, côté base, sans relire ni réécrire le tableau :

```js
db.tasks.findOneAndUpdate(
  { _id: taskId, companyId, "checklist._id": itemId },
  { $set: { "checklist.$[item].done": true, updatedAt: new Date() } },
  { arrayFilters: [{ "item._id": itemId }], returnDocument: "after" }
)
```

L'ajout utilise `$push` et la suppression `$pull: { checklist: { _id: itemId } }`. Deux personnes qui cochent deux
éléments différents en même temps ne s'écrasent pas, car chaque mise à jour est atomique sur le document.

### 10.2 Tableau de bord et « Mes tâches », aggregation pipeline

Les statistiques sont calculées **par la base, en un seul aller-retour**, grâce à `$facet` qui exécute plusieurs
sous-pipelines sur les mêmes tâches :

```js
[
  { $match: { companyId, projectId: { $in: projectIds } } },
  { $lookup: { from: "projects", ... } },   // limité à companyId
  { $set: { done: ..., overdue: ... } },     // terminée = dernière colonne
  { $facet: { totals: [...], byStatus: [...], byProject: [...], byAssignee: [...],
              createdPerWeek: [...], completedPerWeek: [...] } }
]
```

Le `$lookup` filtre lui aussi sur `companyId`, une jointure ne peut donc pas sortir de l'entreprise.
« Mes tâches » suit le même principe, avec un tri calculé en base (échéance puis priorité via `$switch`).

### 10.3 Journal d'activité et index TTL

L'index TTL laisse MongoDB supprimer lui-même les entrées de plus de `ACTIVITY_TTL_DAYS` jours (90 par défaut), sans
tâche planifiée à écrire. Le journal est lu par **curseur** plutôt que par `skip`, coûteux sur un long historique.

### 10.4 Pièces jointes dans GridFS

Stocker les fichiers dans MongoDB donne une seule base à sauvegarder et à répliquer, aucun disque partagé
entre instances de l'application, ainsi que l'isolation et les cascades par `metadata`. Le téléchargement est diffusé
en flux, sans charger le fichier en mémoire.

### 10.5 Recherche plein texte avec un index texte composé

L'index `tasks_text` couvre le titre, les étiquettes, la description, la checklist et les commentaires. La
recherche est un `$match` avec `$text`, trié par pertinence et limité à 20 résultats.

- **Langue française.** Racinisation (« documentations » trouve « documentation »), mots vides ignorés (« la », « de »),
  insensibilité à la casse et aux accents (« ecrire » trouve « Écrire »).
- **Pondération.** Un mot du titre pèse 10 fois plus qu'un mot de commentaire, et les résultats sont triés par le score
  de pertinence.
- **`companyId` en préfixe de l'index.** MongoDB refuse alors toute recherche qui ne précise pas l'entreprise.
  L'isolation est donc garantie par l'index lui-même, et l'index reste compatible avec un sharding par `companyId`.
- **Limites.** Pas de recherche par préfixe (« docu » ne trouve pas « documentation ») ni de tolérance aux fautes, ce
  serait le rôle d'Atlas Search.
