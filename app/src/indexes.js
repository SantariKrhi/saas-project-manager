const config = require('./config');

// Index créés par l'application à chaque démarrage (createIndex est idempotent) :
// ils existent donc aussi sur une base déjà remplie, pas seulement au premier lancement.
// companyId est toujours en préfixe : requêtes ciblées sur une entreprise, compatibles sharding.
async function ensureIndexes(db) {
  const specs = [
    ['companies', { slug: 1 }, { unique: true }],
    ['users', { companyId: 1, email: 1 }, { unique: true }],
    ['projects', { companyId: 1, _id: 1 }],
    ['projects', { companyId: 1, memberIds: 1 }],
    // Board Kanban : tâches d'un projet, par colonne, dans l'ordre
    ['tasks', { companyId: 1, projectId: 1, status: 1, position: 1 }],
    // « Mes tâches » : tâches d'une personne triées par échéance
    ['tasks', { companyId: 1, assigneeId: 1, dueDate: 1 }],
    // Calendrier : tâches d'un projet sur une plage d'échéances
    ['tasks', { companyId: 1, projectId: 1, dueDate: 1 }],
    // Journal : dernières entrées d'un projet
    ['activities', { companyId: 1, projectId: 1, at: -1 }],
    // TTL : MongoDB supprime lui-même les entrées plus anciennes que N jours
    ['activities', { at: 1 }, { expireAfterSeconds: config.activityTtlDays * 24 * 3600, name: 'activities_ttl' }],
    // Pièces jointes GridFS : retrouver les fichiers d'une tâche (cascades)
    ['attachments.files', { 'metadata.companyId': 1, 'metadata.taskId': 1 }],
  ];
  for (const [collection, keys, options = {}] of specs) {
    try {
      await db.collection(collection).createIndex(keys, options);
    } catch (err) {
      // Durée de rétention modifiée (ACTIVITY_TTL_DAYS) : on ajuste l'index TTL existant au lieu de le recréer.
      if (err.codeName !== 'IndexOptionsConflict' || options.expireAfterSeconds === undefined) throw err;
      await db.command({ collMod: collection, index: { name: options.name, expireAfterSeconds: options.expireAfterSeconds } });
    }
  }
}

module.exports = { ensureIndexes };
