const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { repo } = require('../repositories');
const { isAdmin, loadProject } = require('../lib/access');
const { logActivity } = require('../lib/activity');
const { HttpError, notFound, badRequest, idParam, toId, isStr } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);

const DEFAULT_COLUMNS = ['todo', 'doing', 'review', 'done'];

function parseColumns(columns) {
  if (!Array.isArray(columns) || !columns.length || !columns.every(isStr)) {
    throw badRequest('columns : tableau non vide de chaînes');
  }
  const cleaned = columns.map((c) => c.trim());
  if (new Set(cleaned).size !== cleaned.length) throw badRequest('columns : doublons interdits');
  return cleaned;
}

// Renommages de colonnes { from, to } : `from` est une colonne actuelle, `to` une colonne de la nouvelle liste.
// Les tâches de `from` passent dans `to`. Interdit de fusionner dans une colonne existante conservée.
function parseRenames(raw, oldColumns, newColumns) {
  if (!Array.isArray(raw)) throw badRequest('renamedColumns : tableau requis');
  const renames = raw.map((r) => {
    if (!r || !isStr(r.from) || !isStr(r.to)) throw badRequest('renamedColumns : { from, to } requis');
    return { from: r.from.trim(), to: r.to.trim() };
  }).filter((r) => r.from !== r.to);
  const froms = renames.map((r) => r.from);
  const tos = renames.map((r) => r.to);
  if (new Set(froms).size !== froms.length || new Set(tos).size !== tos.length) throw badRequest('renamedColumns : doublons interdits');
  for (const { from, to } of renames) {
    if (!oldColumns.includes(from)) throw badRequest(`renamedColumns : colonne inconnue « ${from} »`);
    if (!newColumns.includes(to)) throw badRequest(`renamedColumns : « ${to} » absente de columns`);
    if (oldColumns.includes(to) && !froms.includes(to)) throw badRequest(`renamedColumns : « ${to} » existe déjà`);
  }
  return renames;
}

// Vérifie que tous les identifiants désignent des utilisateurs de l'entreprise courante.
async function parseMemberIds(req, raw) {
  if (!Array.isArray(raw)) throw badRequest('memberIds : tableau requis');
  const ids = raw.map(toId);
  if (ids.some((i) => !i)) throw badRequest('memberIds : identifiant invalide');
  const unique = [...new Map(ids.map((i) => [i.toString(), i])).values()];
  if ((await repo(req).users.getMany(unique)).length !== unique.length) {
    throw badRequest('memberIds : utilisateur inconnu');
  }
  return unique;
}

// Un admin voit tous les projets de l'entreprise ; un membre uniquement les siens.
router.get('/', async (req, res) => {
  res.json(await repo(req).projects.list(isAdmin(req) ? {} : { memberIds: req.auth.userId }));
});

router.get('/:id', async (req, res) => {
  res.json(await loadProject(req, req.params.id));
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, description = '', columns = DEFAULT_COLUMNS, memberIds = [] } = req.body || {};
  if (!isStr(name)) throw badRequest('name requis');
  if (typeof description !== 'string') throw badRequest('description invalide');
  const members = await parseMemberIds(req, memberIds);
  if (!members.some((m) => m.equals(req.auth.userId))) members.push(req.auth.userId);
  const project = await repo(req).projects.create({ name: name.trim(), description,
    columns: parseColumns(columns), memberIds: members });
  await logActivity(req, project._id, 'project.created', { name: project.name });
  res.status(201).json(project);
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { name, description, columns, renamedColumns = [] } = req.body || {};
  const set = {};
  let renames = [];
  if (name !== undefined) { if (!isStr(name)) throw badRequest('name invalide'); set.name = name.trim(); }
  if (description !== undefined) { if (typeof description !== 'string') throw badRequest('description invalide'); set.description = description; }
  if (columns !== undefined) {
    set.columns = parseColumns(columns);
    renames = parseRenames(renamedColumns, project.columns, set.columns);
    // On ne supprime pas une colonne qui contient encore des tâches (une colonne renommée n'est pas supprimée).
    const renamed = renames.map((r) => r.from);
    const removed = project.columns.filter((c) => !set.columns.includes(c) && !renamed.includes(c));
    if (removed.length && (await repo(req).tasks.countByStatuses(project._id, removed)) > 0) {
      throw new HttpError(409, 'Une colonne supprimée contient encore des tâches : déplacez-les d\'abord');
    }
  }
  if (!Object.keys(set).length) throw badRequest('Aucun champ à modifier');
  if (renames.length) await repo(req).tasks.renameStatuses(project._id, renames);
  const updated = await repo(req).projects.update(project._id, set);
  const changed = Object.keys(set).filter((k) => JSON.stringify(set[k]) !== JSON.stringify(project[k]));
  if (changed.length) await logActivity(req, project._id, 'project.updated', { name: updated.name, fields: changed });
  res.json(updated);
});

router.put('/:id/members', requireAdmin, async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const members = await parseMemberIds(req, (req.body || {}).memberIds);
  const updated = await repo(req).projects.setMembers(project, members);
  const added = members.filter((m) => !project.memberIds.some((o) => o.equals(m))).length;
  const removed = project.memberIds.filter((o) => !members.some((m) => m.equals(o))).length;
  if (added || removed) await logActivity(req, project._id, 'project.members', { name: project.name, added, removed });
  res.json(updated);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = idParam(req.params.id);
  if (!(await repo(req).projects.remove(id))) throw notFound();
  res.status(204).end();
});

module.exports = router;
