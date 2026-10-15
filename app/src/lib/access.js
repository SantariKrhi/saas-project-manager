const { repo } = require('../repositories');
const { idParam, notFound } = require('./http');

const isAdmin = (req) => req.auth.role === 'admin';
const isMember = (req, project) => project.memberIds.some((m) => m.equals(req.auth.userId));

// Charge un projet de l'entreprise courante. Un projet auquel l'utilisateur n'a pas accès
// est signalé en 404 (et non 403) pour ne pas révéler son existence.
async function loadProject(req, rawId) {
  const project = await repo(req).projects.get(idParam(rawId));
  if (!project || !(isAdmin(req) || isMember(req, project))) throw notFound();
  return project;
}

module.exports = { isAdmin, isMember, loadProject };
