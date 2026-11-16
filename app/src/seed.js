const { ObjectId } = require('mongodb');
const { DAY_MS: DAY } = require('./lib/constants');
const { hashPassword } = require('./lib/passwords');

const DEMO_PASSWORD = 'demo1234';

// Dates relatives à aujourd'hui : le jeu de démo reste « vivant » (retards, échéances à venir, historique).
const today = () => new Date(new Date().toDateString());
const daysAgo = (n) => new Date(today().getTime() - n * DAY + 10 * 3600 * 1000); // 10 h du jour concerné
const dueIn = (n) => {
  const d = new Date(today().getTime() + n * DAY);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); // échéance stockée à minuit UTC
};
const checklist = (items) => items.map(([text, done]) => ({ _id: new ObjectId(), text, done }));

// [titre, statut, assigné, priorité, créée il y a N jours, terminée il y a N jours, échéance dans N jours, étiquettes, checklist]
const DEMO_TASKS = [
  ['Préparer le cahier des charges', 'done', 'alice', 'high', 40, 35, -36, ['spec']],
  ['Modéliser les collections MongoDB', 'done', 'alice', 'high', 38, 30, -30, ['bdd'],
    [['companies', true], ['users', true], ['projects', true], ['tasks', true]]],
  ['Mettre en place Docker Compose', 'done', 'bob', 'medium', 33, 26, null, ['infra']],
  ['API d’authentification JWT', 'done', 'bob', 'high', 28, 19, -18, ['back']],
  ['Tests d’isolation multi-entreprise', 'done', 'alice', 'high', 18, 9, -10, ['tests']],
  ['Corriger l’affichage mobile', 'done', 'chloe', 'medium', 12, 4, -5, ['front']],
  ['Développer la page de login', 'review', 'bob', 'medium', 20, null, -2, ['front', 'urgent']],
  ['Relire le code', 'review', 'alice', 'low', 10, null, 5, []],
  ['Board Kanban en drag & drop', 'doing', 'chloe', 'high', 14, null, 3, ['front'],
    [['Colonnes', true], ['Cartes', true], ['Glisser-déposer', false], ['Calcul des positions', false]]],
  ['Écrire la documentation', 'todo', 'bob', 'medium', 6, null, 10, ['doc']],
  ['Automatiser les sauvegardes de la base', 'todo', 'chloe', 'high', 3, null, 20, ['infra']],
  ['Optimiser les requêtes du tableau de bord', 'todo', null, 'low', 2, null, null, ['bdd']],
];
const SITE_TASKS = [
  ['Maquette de la page d’accueil', 'terminé', 'chloe', 'medium', 30, 22, -21, ['design']],
  ['Rédiger les textes', 'en cours', 'bob', 'low', 15, null, -1, ['contenu']],
  ['Intégration responsive', 'à faire', 'chloe', 'high', 5, null, 12, ['front']],
  ['Mise en ligne', 'à faire', null, 'medium', 1, null, null, []],
];

// Jeu de données de démo : 2 entreprises pour illustrer l'isolation.
// Ne s'exécute que si la base est vide.
async function seed(db) {
  if ((await db.collection('companies').countDocuments()) > 0) return;

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const [name, slug] of [['Acme', 'acme'], ['Globex', 'globex']]) {
    const companyId = new ObjectId();
    await db.collection('companies').insertOne({ _id: companyId, name, slug, createdAt: daysAgo(45) });

    const user = (first, last, email, role) => ({ _id: new ObjectId(), companyId, email: `${email}@${slug}.test`, passwordHash,
      firstName: first, lastName: last, role, createdAt: daysAgo(45) });
    const people = {
      alice: user('Alice', name, 'admin', 'admin'),
      bob: user('Bob', name, 'bob', 'member'),
      chloe: user('Chloé', 'Martin', 'chloe', 'member'),
    };
    await db.collection('users').insertMany(Object.values(people));
    const memberIds = Object.values(people).map((u) => u._id);

    const projects = [
      { _id: new ObjectId(), name: 'Site vitrine', description: 'Refonte du site de présentation',
        columns: ['à faire', 'en cours', 'terminé'], tasks: SITE_TASKS, createdAt: daysAgo(31) },
      { _id: new ObjectId(), name: `Projet démo ${name}`, description: 'Outil de gestion de projet : développement de la V1',
        columns: ['todo', 'doing', 'review', 'done'], tasks: DEMO_TASKS, createdAt: daysAgo(41) },
    ];

    for (const p of projects) {
      await db.collection('projects').insertOne({ _id: p._id, companyId, name: p.name, description: p.description,
        memberIds, columns: p.columns, createdAt: p.createdAt });

      const positions = {};
      const activities = [];
      const tasks = p.tasks.map(([title, status, who, priority, created, completed, due, labels, items]) => {
        positions[status] = (positions[status] || 0) + 1024;
        const task = {
          _id: new ObjectId(), companyId, projectId: p._id, title, description: '', status, position: positions[status],
          assigneeId: who ? people[who]._id : null, priority, dueDate: due == null ? null : dueIn(due), labels,
          comments: [], checklist: checklist(items || []), attachments: [],
          completedAt: completed == null ? null : daysAgo(completed), createdAt: daysAgo(created), updatedAt: daysAgo(completed ?? created),
        };
        activities.push({ companyId, projectId: p._id, userId: people.alice._id, type: 'task.created',
          data: { taskId: task._id, title, status: p.columns[0] }, at: task.createdAt });
        if (completed != null) {
          activities.push({ companyId, projectId: p._id, userId: task.assigneeId || people.alice._id, type: 'task.moved',
            data: { taskId: task._id, title, from: p.columns[p.columns.length - 2], to: status }, at: task.completedAt });
        }
        return task;
      });

      const login = tasks.find((t) => t.title === 'Développer la page de login');
      if (login) {
        login.description = 'Formulaire de connexion, gestion des erreurs et lien « nouvelle entreprise ».';
        login.comments = [
          { userId: people.bob._id, text: 'Je regarde la validation côté client.', at: daysAgo(3) },
          { userId: people.alice._id, text: 'Pense aux messages d’erreur génériques (pas d’indice sur l’email).', at: daysAgo(2) },
        ];
        login.comments.forEach((c) => activities.push({ companyId, projectId: p._id, userId: c.userId, type: 'comment.added',
          data: { taskId: login._id, title: login.title }, at: c.at }));
      }

      await db.collection('tasks').insertMany(tasks);
      await db.collection('activities').insertMany(activities);
    }
  }
  console.log(`Seed de démo inséré (mot de passe : ${DEMO_PASSWORD})`);
}

module.exports = { seed };
