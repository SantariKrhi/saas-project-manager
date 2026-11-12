const { repo } = require('../repositories');

// Journalise une action dans le projet. Une erreur de journal ne doit jamais faire échouer l'action elle-même.
async function logActivity(req, projectId, type, data = {}) {
  try {
    await repo(req).activities.log({ projectId, userId: req.auth.userId, type, data });
  } catch (err) {
    console.error('Journal d\'activité :', err.message);
  }
}

module.exports = { logActivity };
