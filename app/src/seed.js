const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

const DEMO_PASSWORD = 'demo1234';
const COLUMNS = ['todo', 'doing', 'review', 'done'];

// Jeu de données de démo : 2 entreprises pour illustrer l'isolation.
// Ne s'exécute que si la base est vide.
async function seed(db) {
  if ((await db.collection('companies').countDocuments()) > 0) return;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date();

  for (const [name, slug] of [['Acme', 'acme'], ['Globex', 'globex']]) {
    const companyId = new ObjectId();
    await db.collection('companies').insertOne({ _id: companyId, name, slug, plan: 'free', createdAt: now });

    const admin = { _id: new ObjectId(), companyId, email: `admin@${slug}.test`, passwordHash,
      firstName: 'Alice', lastName: name, role: 'admin', createdAt: now };
    const member = { _id: new ObjectId(), companyId, email: `bob@${slug}.test`, passwordHash,
      firstName: 'Bob', lastName: name, role: 'member', createdAt: now };
    await db.collection('users').insertMany([admin, member]);

    const projectId = new ObjectId();
    await db.collection('projects').insertOne({ _id: projectId, companyId, name: `Projet démo ${name}`,
      description: 'Projet de démonstration', memberIds: [admin._id, member._id], columns: COLUMNS,
      createdBy: admin._id, createdAt: now });

    await db.collection('tasks').insertMany([
      ['Préparer le cahier des charges', 'done', admin._id, 'high'],
      ['Développer la page de login', 'doing', member._id, 'medium'],
      ['Relire le code', 'review', admin._id, 'low'],
      ['Écrire la documentation', 'todo', member._id, 'medium'],
    ].map(([title, status, assigneeId, priority], i) => ({
      companyId, projectId, title, description: '', status, position: (i + 1) * 1024,
      assigneeId, priority, dueDate: null, labels: [], comments: [], createdAt: now, updatedAt: now,
    })));
  }
  console.log(`Seed de démo inséré (mot de passe : ${DEMO_PASSWORD})`);
}

module.exports = { seed };
