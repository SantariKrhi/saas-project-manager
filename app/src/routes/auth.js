const express = require('express');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const publicUser = (u) => ({ id: u._id, companyId: u.companyId, email: u.email,
  firstName: u.firstName, lastName: u.lastName, role: u.role });

// Crée une entreprise et son premier administrateur.
router.post('/register-company', async (req, res) => {
  const { companyName, email, password, firstName, lastName } = req.body || {};
  if (![companyName, email, password, firstName, lastName].every((v) => typeof v === 'string' && v.trim())) {
    return res.status(400).json({ error: 'companyName, email, password, firstName, lastName requis' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  const slug = slugify(companyName);
  if (!slug) return res.status(400).json({ error: 'Nom d\'entreprise invalide' });

  const db = getDb();
  const now = new Date();
  const company = { _id: new ObjectId(), name: companyName.trim(), slug, plan: 'free', createdAt: now };
  try {
    await db.collection('companies').insertOne(company);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Entreprise déjà existante' });
    throw err;
  }
  const user = { _id: new ObjectId(), companyId: company._id, email: email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10), firstName: firstName.trim(), lastName: lastName.trim(),
    role: 'admin', createdAt: now };
  await db.collection('users').insertOne(user);
  res.status(201).json({ token: signToken(user), company: { id: company._id, name: company.name, slug }, user: publicUser(user) });
});

// L'email n'est unique que par entreprise : on identifie l'entreprise par son slug.
router.post('/login', async (req, res) => {
  const { company: slug, email, password } = req.body || {};
  if (![slug, email, password].every((v) => typeof v === 'string' && v)) {
    return res.status(400).json({ error: 'company, email, password requis' });
  }
  const db = getDb();
  const company = await db.collection('companies').findOne({ slug });
  const user = company && await db.collection('users').findOne({ companyId: company._id, email: email.trim().toLowerCase() });
  // Même message dans tous les cas d'échec : on ne révèle pas ce qui existe.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await getDb().collection('users').findOne({ _id: req.auth.userId, companyId: req.auth.companyId });
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  res.json(publicUser(user));
});

module.exports = router;
