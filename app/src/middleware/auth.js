const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const config = require('../config');
const { getDb } = require('../db');
const { forCompany } = require('../repositories');

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), companyId: user.companyId.toString(), role: user.role },
    config.jwtSecret,
    { expiresIn: '8h' },
  );
}

// Le companyId vient UNIQUEMENT du token signé, jamais du body ni des paramètres.
// L'existence de l'utilisateur et son rôle sont relus en base à chaque requête : un utilisateur
// supprimé perd immédiatement l'accès et un changement de rôle est effectif sans nouveau login.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  let auth;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    auth = { userId: new ObjectId(payload.sub), companyId: new ObjectId(payload.companyId) };
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
  const user = await forCompany(getDb(), auth.companyId).users.get(auth.userId);
  if (!user) return res.status(401).json({ error: 'Utilisateur introuvable' });
  req.auth = { ...auth, role: user.role };
  next();
}

function requireAdmin(req, res, next) {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' });
  next();
}

module.exports = { signToken, requireAuth, requireAdmin };
