// Exécuté automatiquement au premier démarrage de Mongo (volume vide).
// TODO : validators $jsonSchema, index et jeu de données de démo.
const database = db.getSiblingDB('saas');

['companies', 'users', 'projects', 'tasks'].forEach((name) => {
  if (!database.getCollectionNames().includes(name)) database.createCollection(name);
});

// Index (isolation multi-tenant : companyId toujours en préfixe)
database.users.createIndex({ companyId: 1, email: 1 }, { unique: true });
database.projects.createIndex({ companyId: 1, _id: 1 });
database.tasks.createIndex({ companyId: 1, projectId: 1, status: 1, position: 1 });
