# Spécification fonctionnelle

## 1. Présentation

Application web SaaS de gestion de projet, inspirée de Trello / Notion / ClickUp. Chaque **entreprise** dispose
de son espace : elle gère ses **utilisateurs**, ses **projets** et les **tâches** de ces projets, visualisées
dans un **tableau Kanban**. Les données de deux entreprises sont strictement isolées.

## 2. Acteurs et rôles

| Rôle | Description |
|---|---|
| Visiteur | Non connecté : peut se connecter ou créer une entreprise |
| **Administrateur** | Gère l'entreprise, l'équipe et les projets ; accède à tous les projets de son entreprise |
| **Membre** | Travaille sur les projets auxquels il est assigné : tâches, commentaires |

La création d'une entreprise crée automatiquement son premier administrateur.

### Matrice des droits

| Action | Visiteur | Membre | Admin |
|---|:-:|:-:|:-:|
| Créer une entreprise / se connecter | ✔ | – | – |
| Voir son entreprise | – | ✔ | ✔ |
| Renommer / supprimer l'entreprise | – | ✘ | ✔ |
| Lister les utilisateurs de l'entreprise | – | ✔ | ✔ |
| Créer / modifier / supprimer un utilisateur | – | ✘ | ✔ |
| Voir les projets | – | ses projets | tous |
| Créer / modifier / supprimer un projet, gérer ses membres et colonnes | – | ✘ | ✔ |
| Voir le Kanban, le calendrier et le journal d'un projet | – | si membre | ✔ |
| Voir « Mes tâches » et le tableau de bord | – | ses projets | tous les projets |
| Créer / modifier / déplacer / supprimer une tâche, commenter, gérer checklist et pièces jointes | – | si membre du projet | ✔ |

Tout accès à une ressource d'une autre entreprise, ou d'un projet dont on n'est pas membre, se comporte comme
si la ressource n'existait pas (« introuvable »).

## 3. Fonctionnalités

### 3.1 Obligatoires (énoncé)

| # | Fonctionnalité | Détail |
|---|---|---|
| F1 | CRUD **entreprise** | Création à l'inscription, consultation, renommage, suppression (avec confirmation du nom d'identifiant) qui efface toutes ses données |
| F2 | CRUD **utilisateurs** | Rattachés à une entreprise ; email unique dans l'entreprise ; mot de passe de 8 caractères minimum ; rôle admin / membre |
| F3 | CRUD **projets** | Rattachés à une entreprise ; nom, description, colonnes, membres |
| F4 | CRUD **tâches** | Créées au sein d'un projet |
| F5 | **Isolation stricte** entre entreprises | Voir spécification technique §5 |
| F6 | **Assignation** d'utilisateurs à un projet | Liste des membres modifiable par l'admin ; retirer un membre désassigne ses tâches du projet |
| F7 | **Attribution** d'une tâche à un utilisateur | L'assigné doit être membre du projet |
| F8 | **Statut** d'une tâche | Un statut = une colonne du Kanban du projet |
| F9 | **Tableau Kanban** | Colonnes du projet, cartes triées, déplacement par glisser-déposer |

### 3.2 Fonctionnalités additionnelles

| # | Fonctionnalité | Détail |
|---|---|---|
| A1 | Colonnes personnalisables | L'admin ajoute, renomme, réordonne et supprime les colonnes du projet (défaut : `todo`, `doing`, `review`, `done`) ; renommer conserve les tâches ; une colonne non vide ne peut pas être supprimée |
| A2 | Priorité | Haute / moyenne / basse, visible par la couleur de la carte |
| A3 | Date d'échéance | Affichée sur la carte ; en rouge si dépassée et tâche non terminée |
| A4 | Étiquettes | Mots-clés libres, saisis en pastilles (Entrée pour ajouter), affichés sur la carte |
| A5 | Commentaires | Fil de discussion par tâche (auteur, date) |
| A6 | Filtres du Kanban | Par assigné et par priorité |
| A7 | Ajout rapide | Saisie d'un titre en bas d'une colonne + Entrée |
| A8 | Gestion de l'équipe | Écran réservé aux admins : ajout, changement de rôle, suppression |
| A9 | Jeu de données de démo | Deux entreprises pré-remplies (historique sur 6 semaines) pour tester l'isolation et les statistiques |
| A10 | **Checklist** | Sous-tâches à cocher dans une tâche, avec barre d'avancement ; « 2/4 » affiché sur la carte |
| A11 | **Mes tâches** | Toutes les tâches assignées à l'utilisateur, tous projets confondus, rangées en : en retard, aujourd'hui, 7 jours, plus tard, sans échéance, terminées |
| A12 | **Journal d'activité** | Historique du projet (créations, déplacements, modifications, commentaires, pièces jointes…) dans un panneau latéral, groupé par jour ; un clic ouvre la tâche ; conservé 90 jours |
| A13 | **Pièces jointes** | Fichiers (10 Mo max.) ajoutés par glisser-déposer ou sélection, aperçu des images, téléchargement, suppression |
| A14 | **Tableau de bord** | Indicateurs (tâches, terminées, en retard, non assignées) et graphiques : créées/terminées par semaine, avancement par projet ou par colonne, charge par personne, répartition par priorité ; pour un projet ou tous |
| A15 | **Calendrier** | Vue mensuelle des échéances d'un projet ; glisser une tâche sur un jour fixe son échéance, la glisser dans « Sans échéance » la retire ; en liste sur mobile |
| A16 | Thème clair / sombre | Automatique ou au choix, contrastes conformes WCAG AA |

## 4. Règles de gestion

1. Tout utilisateur, projet et tâche appartient à exactement une entreprise.
2. L'email d'un utilisateur est unique **au sein de son entreprise** (deux entreprises peuvent avoir le même email).
3. Une entreprise a un identifiant (`slug`) unique, dérivé de son nom (« Mon Entreprise » → `mon-entreprise`) ; il sert à se connecter.
4. Une entreprise a toujours au moins un administrateur : on ne peut pas retirer le dernier, ni supprimer son propre compte.
5. Une tâche appartient à un projet, a un titre, un statut (parmi les colonnes du projet) et une position dans sa colonne.
6. Une tâche n'est assignable qu'à un membre du projet ; un membre retiré du projet est désassigné de ses tâches.
7. Un utilisateur supprimé est retiré de tous les projets et désassigné de toutes ses tâches ; son accès cesse immédiatement.
8. Supprimer un projet supprime ses tâches ; supprimer l'entreprise supprime tout son contenu.
9. Un membre ne voit que les projets dont il est membre ; un admin voit tous les projets.
10. Un message d'échec de connexion est identique que l'entreprise, l'email ou le mot de passe soit erroné.
11. Une tâche est « terminée » quand elle est dans la dernière colonne de son projet ; elle est « en retard » si son échéance est passée et qu'elle n'est pas terminée.
12. Une pièce jointe fait 10 Mo au plus ; une tâche en compte 20 au plus et sa checklist 50 éléments au plus.
13. Le journal d'activité est conservé 90 jours (réglable) puis supprimé automatiquement.

## 5. Parcours et écrans

| Écran | Contenu |
|---|---|
| **Connexion / Nouvelle entreprise** | Onglets : connexion (entreprise, email, mot de passe) ou création (nom d'entreprise, prénom, nom, email, mot de passe) |
| **Projets** | Cartes des projets accessibles ; formulaire de création (admin) |
| **Kanban d'un projet** | Colonnes, cartes, filtres, ajout rapide, bouton « Paramètres » (admin) |
| **Fenêtre tâche** | Titre, description, statut, assigné, priorité, échéance, étiquettes, suppression, commentaires |
| **Paramètres du projet** (admin) | Nom, description, colonnes, membres (cases à cocher), suppression |
| **Calendrier d'un projet** | Mois en grille (liste sur mobile), tâches sans échéance à côté, glisser-déposer pour changer l'échéance |
| **Activité** (panneau) | Historique du projet groupé par jour, « Voir plus » pour remonter le temps |
| **Mes tâches** | Tâches assignées par urgence, ouverture directe de la fenêtre tâche |
| **Tableau de bord** | Indicateurs et graphiques, choix « tous mes projets » ou un projet |
| **Équipe** (admin) | Tableau des utilisateurs, ajout, changement de rôle, suppression |

Navigation : barre supérieure (nom de l'entreprise, Projets, Équipe pour les admins, utilisateur, déconnexion).
L'interface s'adapte aux petits écrans et au mode sombre.

## 6. User stories

| En tant que… | Je veux… | Afin de… |
|---|---|---|
| Fondateur | créer l'espace de mon entreprise | commencer à organiser mes projets |
| Admin | ajouter des collègues avec un rôle | qu'ils puissent travailler dans l'outil |
| Admin | créer un projet et choisir ses membres | cadrer qui travaille sur quoi |
| Admin | personnaliser les colonnes d'un projet | refléter notre façon de travailler |
| Membre | voir mes projets et leur Kanban | savoir où en est le travail |
| Membre | créer une tâche, l'assigner, fixer priorité et échéance | répartir le travail |
| Membre | glisser une carte vers une autre colonne | mettre à jour l'avancement en un geste |
| Membre | filtrer par personne ou priorité | me concentrer sur l'essentiel |
| Membre | commenter une tâche | échanger sans quitter l'outil |
| Membre | découper une tâche en checklist | suivre son avancement pas à pas |
| Membre | joindre une maquette ou un document à une tâche | tout retrouver au même endroit |
| Membre | voir toutes mes tâches, tous projets confondus, par urgence | savoir quoi faire en priorité |
| Membre | voir les échéances du mois dans un calendrier et les déplacer | planifier facilement |
| Membre | consulter l'historique d'un projet | savoir qui a fait quoi et quand |
| Admin | suivre l'avancement et la charge de l'équipe dans un tableau de bord | repérer les retards et rééquilibrer |
| Admin | retirer un collaborateur | qu'il perde l'accès et que ses tâches soient libérées |
| Client SaaS | être certain que les autres entreprises ne voient rien de mes données | respecter la confidentialité |

## 7. Exigences non fonctionnelles

- **Déploiement** : une seule commande `docker compose up -d --build`, sans configuration manuelle.
- **Sécurité** : mots de passe hachés (bcrypt), JWT, isolation par entreprise, aucune injection HTML côté interface (texte inséré via le DOM, jamais en HTML brut).
- **Configurabilité** : connexion MongoDB entièrement pilotée par `MONGO_URI`.
- **Évolutivité** : modèle et index prêts pour la réplication et le sharding par `companyId`.
- **Testabilité** : suite de tests d'API (`node tests/smoke.js`) couvrant isolation, droits, Kanban et cascades.

## 8. Hors périmètre

Réinitialisation de mot de passe, notifications, recherche plein texte, facturation (le champ
`plan` est réservé), authentification externe (SSO), application mobile native.
