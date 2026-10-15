const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { repo } = require('../repositories');
const { HttpError, notFound, badRequest, idParam, isStr } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);

const ROLES = ['admin', 'member'];
const isEmail = (v) => isStr(v) && /^[^@\s]+@[^@\s]+$/.test(v.trim());

// Tous les utilisateurs authentifiés peuvent lister leurs collègues (nécessaire pour les assignations).
router.get('/', async (req, res) => {
  res.json(await repo(req).users.list());
});

router.get('/:id', async (req, res) => {
  const user = await repo(req).users.get(idParam(req.params.id));
  if (!user) throw notFound();
  res.json(user);
});

router.post('/', requireAdmin, async (req, res) => {
  const { email, password, firstName, lastName, role = 'member' } = req.body || {};
  if (!isEmail(email) || !isStr(firstName) || !isStr(lastName) || !isStr(password)) {
    throw badRequest('email, password, firstName, lastName requis');
  }
  if (password.length < 8) throw badRequest('Mot de passe : 8 caractères minimum');
  if (!ROLES.includes(role)) throw badRequest('role invalide');
  try {
    const user = await repo(req).users.create({ email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10), firstName: firstName.trim(), lastName: lastName.trim(), role });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Email déjà utilisé dans cette entreprise');
    throw err;
  }
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params.id);
  const r = repo(req);
  const target = await r.users.get(id);
  if (!target) throw notFound();

  const { email, password, firstName, lastName, role } = req.body || {};
  const set = {};
  if (email !== undefined) { if (!isEmail(email)) throw badRequest('email invalide'); set.email = email.trim().toLowerCase(); }
  if (firstName !== undefined) { if (!isStr(firstName)) throw badRequest('firstName invalide'); set.firstName = firstName.trim(); }
  if (lastName !== undefined) { if (!isStr(lastName)) throw badRequest('lastName invalide'); set.lastName = lastName.trim(); }
  if (password !== undefined) {
    if (!isStr(password) || password.length < 8) throw badRequest('Mot de passe : 8 caractères minimum');
    set.passwordHash = await bcrypt.hash(password, 10);
  }
  if (role !== undefined) {
    if (!ROLES.includes(role)) throw badRequest('role invalide');
    if (role === 'member' && target.role === 'admin' && (await r.users.countAdmins()) <= 1) {
      throw new HttpError(409, 'Impossible de retirer le dernier administrateur');
    }
    set.role = role;
  }
  if (!Object.keys(set).length) throw badRequest('Aucun champ à modifier');

  try {
    res.json(await r.users.update(id, set));
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Email déjà utilisé dans cette entreprise');
    throw err;
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params.id);
  if (id.equals(req.auth.userId)) throw badRequest('Vous ne pouvez pas supprimer votre propre compte');
  if (!(await repo(req).users.remove(id))) throw notFound();
  res.status(204).end();
});

module.exports = router;
