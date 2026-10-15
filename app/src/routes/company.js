const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { repo } = require('../repositories');
const { HttpError, badRequest, isStr } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);

const view = (c) => ({ id: c._id, name: c.name, slug: c.slug, plan: c.plan, createdAt: c.createdAt });

router.get('/', async (req, res) => {
  res.json(view(await repo(req).company.get()));
});

router.patch('/', requireAdmin, async (req, res) => {
  const { name } = req.body || {};
  if (!isStr(name)) throw badRequest('name requis');
  res.json(view(await repo(req).company.update({ name: name.trim() })));
});

// Suppression de l'entreprise et de toutes ses données. Confirmation par le slug.
router.delete('/', requireAdmin, async (req, res) => {
  const company = await repo(req).company.get();
  if ((req.body || {}).confirm !== company.slug) {
    throw new HttpError(400, `Confirmation requise : { "confirm": "${company.slug}" }`);
  }
  await repo(req).company.removeAll();
  res.status(204).end();
});

module.exports = router;
