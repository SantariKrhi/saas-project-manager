const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { repo } = require('../repositories');
const { isAdmin, loadProject } = require('../lib/access');
const { badRequest } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);

// Projets visibles par l'utilisateur : tous pour un admin, ceux dont il est membre sinon.
async function visibleProjectIds(req) {
  const list = await repo(req).projects.list(isAdmin(req) ? {} : { memberIds: req.auth.userId });
  return list.map((p) => p._id);
}

// « Mes tâches » : toutes les tâches assignées à l'utilisateur, tous projets confondus.
router.get('/me/tasks', async (req, res) => {
  res.json(await repo(req).tasks.mine(req.auth.userId, await visibleProjectIds(req)));
});

// Recherche plein texte dans les tâches des projets visibles : ?q=texte[&projectId=]
router.get('/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2 || q.length > 100) throw badRequest('q : entre 2 et 100 caractères');
  const ids = req.query.projectId
    ? [(await loadProject(req, req.query.projectId))._id]
    : await visibleProjectIds(req);
  res.json(await repo(req).tasks.search(q, ids));
});

// Tableau de bord : statistiques d'un projet (?projectId=) ou de tous les projets visibles.
router.get('/stats', async (req, res) => {
  const ids = req.query.projectId
    ? [(await loadProject(req, req.query.projectId))._id]
    : await visibleProjectIds(req);
  res.json(await repo(req).tasks.stats(ids));
});

module.exports = router;
