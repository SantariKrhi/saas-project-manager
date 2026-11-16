const express = require('express');
const { signToken, requireAuth } = require('../middleware/auth');
const { accounts } = require('../repositories');
const { HttpError, badRequest, isStr, isEmail, normalizeEmail } = require('../lib/http');
const { hashPassword, verifyPassword } = require('../lib/passwords');

const router = express.Router();

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const publicUser = (u) => ({ id: u._id, companyId: u.companyId, email: u.email,
  firstName: u.firstName, lastName: u.lastName, role: u.role });

// Crée une entreprise et son premier administrateur.
router.post('/register-company', async (req, res) => {
  const { companyName, email, password, firstName, lastName } = req.body || {};
  if (![companyName, firstName, lastName].every(isStr) || !isEmail(email)) {
    throw badRequest('companyName, email, password, firstName, lastName requis');
  }
  const passwordHash = await hashPassword(password);
  const slug = slugify(companyName);
  if (!slug) throw badRequest('Nom d\'entreprise invalide');

  try {
    const { company, user } = await accounts.registerCompany({ name: companyName.trim(), slug },
      { email: normalizeEmail(email), passwordHash, firstName: firstName.trim(), lastName: lastName.trim() });
    res.status(201).json({ token: signToken(user), company: { id: company._id, name: company.name, slug }, user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Entreprise déjà existante');
    throw err;
  }
});

// L'email n'est unique que par entreprise : on identifie l'entreprise par son slug.
router.post('/login', async (req, res) => {
  const { company: slug, email, password } = req.body || {};
  if (![slug, email, password].every(isStr)) throw badRequest('company, email, password requis');
  const user = await accounts.findForLogin(slug.trim().toLowerCase(), normalizeEmail(email));
  // Même message dans tous les cas d'échec : on ne révèle pas ce qui existe.
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, 'Identifiants invalides');
  res.json({ token: signToken(user), user: publicUser(user) });
});

// L'utilisateur a déjà été relu en base par requireAuth.
router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
