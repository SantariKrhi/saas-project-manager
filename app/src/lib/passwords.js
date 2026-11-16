const bcrypt = require('bcryptjs');
const { badRequest } = require('./http');

const MIN_LENGTH = 8;
const ROUNDS = 10;

// Valide puis hache un mot de passe : règle unique pour l'inscription, la création et la modification d'un compte.
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    throw badRequest(`Mot de passe : ${MIN_LENGTH} caractères minimum`);
  }
  return bcrypt.hash(password, ROUNDS);
}

const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

module.exports = { hashPassword, verifyPassword };
