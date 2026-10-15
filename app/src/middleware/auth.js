const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');
const config = require('../config');

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), companyId: user.companyId.toString(), role: user.role },
    config.jwtSecret,
    { expiresIn: '8h' },
  );
}

// Le companyId vient UNIQUEMENT du token signé, jamais du body ni des paramètres.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.auth = {
      userId: new ObjectId(payload.sub),
      companyId: new ObjectId(payload.companyId),
      role: payload.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireAdmin(req, res, next) {
  if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Réservé aux administrateurs' });
  next();
}

module.exports = { signToken, requireAuth, requireAdmin };
