const { ObjectId } = require('mongodb');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const notFound = () => new HttpError(404, 'Ressource introuvable');
const badRequest = (msg) => new HttpError(400, msg);

const toId = (v) => (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) ? new ObjectId(v) : null);

// Un identifiant mal formé est traité comme une ressource inexistante.
function idParam(v) {
  const id = toId(v);
  if (!id) throw notFound();
  return id;
}

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isEmail = (v) => isStr(v) && /^[^@\s]+@[^@\s]+$/.test(v.trim());
const normalizeEmail = (v) => v.trim().toLowerCase();

module.exports = { HttpError, notFound, badRequest, toId, idParam, isStr, isEmail, normalizeEmail };
