const express = require('express');
const { pipeline } = require('node:stream/promises');
const { ObjectId } = require('mongodb');
const { requireAuth } = require('../middleware/auth');
const { repo } = require('../repositories');
const { loadProject } = require('../lib/access');
const { logActivity } = require('../lib/activity');
const { HttpError, notFound, badRequest, idParam, toId, isStr } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ['low', 'medium', 'high'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 20;
const MAX_CHECKLIST = 50;

const lastColumn = (project) => project.columns[project.columns.length - 1];

// Date de fin : posée à l'arrivée dans la dernière colonne, retirée si la tâche en ressort.
// Elle alimente la courbe « tâches terminées par semaine » du tableau de bord.
function completion(project, from, to) {
  if (from === to) return {};
  return { completedAt: to === lastColumn(project) ? new Date() : null };
}

// Charge une tâche ET vérifie l'accès à son projet (404 sinon).
async function loadTask(req) {
  const task = await repo(req).tasks.get(idParam(req.params.id));
  if (!task) throw notFound();
  const project = await loadProject(req, task.projectId.toString());
  return { task, project };
}

function parseDate(value, name) {
  const d = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(d.getTime())) throw badRequest(`${name} invalide`);
  return d;
}

// Valide les champs fournis ; `partial` = true pour un PATCH.
function parseTask(body, project, partial) {
  const { title, description, status, assigneeId, priority, dueDate, labels } = body || {};
  const set = {};

  if (title !== undefined || !partial) { if (!isStr(title)) throw badRequest('title requis'); set.title = title.trim(); }
  if (description !== undefined) { if (typeof description !== 'string') throw badRequest('description invalide'); set.description = description; }
  if (status !== undefined) {
    if (!project.columns.includes(status)) throw badRequest(`status invalide (attendu : ${project.columns.join(', ')})`);
    set.status = status;
  }
  if (assigneeId !== undefined) {
    if (assigneeId === null) set.assigneeId = null;
    else {
      const id = toId(assigneeId);
      if (!id || !project.memberIds.some((m) => m.equals(id))) throw badRequest('assigneeId doit être un membre du projet');
      set.assigneeId = id;
    }
  }
  if (priority !== undefined) {
    if (!PRIORITIES.includes(priority)) throw badRequest(`priority invalide (${PRIORITIES.join(', ')})`);
    set.priority = priority;
  }
  if (dueDate !== undefined) set.dueDate = dueDate === null ? null : parseDate(dueDate, 'dueDate');
  if (labels !== undefined) {
    if (!Array.isArray(labels) || !labels.every(isStr)) throw badRequest('labels : tableau de chaînes');
    set.labels = labels.map((l) => l.trim());
  }
  return set;
}

// --- Kanban -----------------------------------------------------------------

// Tâches du projet regroupées par colonne, triées par position. Filtres : ?assigneeId=&priority=
router.get('/projects/:projectId/board', async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const filter = {};
  if (req.query.assigneeId) {
    const id = toId(req.query.assigneeId);
    if (!id) throw badRequest('assigneeId invalide');
    filter.assigneeId = id;
  }
  if (req.query.priority) {
    if (!PRIORITIES.includes(req.query.priority)) throw badRequest('priority invalide');
    filter.priority = req.query.priority;
  }
  const tasks = await repo(req).tasks.listByProject(project._id, filter);
  const columns = Object.fromEntries(project.columns.map((c) => [c, []]));
  tasks.forEach((t) => { (columns[t.status] ||= []).push(t); });
  res.json({ project: { id: project._id, name: project.name, columns: project.columns }, columns });
});

// --- Journal d'activité ------------------------------------------------------

// Plus récent d'abord ; pagination par curseur : ?before=<date ISO de la dernière entrée reçue>&limit=
router.get('/projects/:projectId/activity', async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
  const before = req.query.before ? parseDate(req.query.before, 'before') : null;
  res.json(await repo(req).activities.list(project._id, { before, limit }));
});

// --- CRUD tâches -------------------------------------------------------------

// Filtres d'échéance (calendrier) : ?dueFrom=AAAA-MM-JJ&dueTo=AAAA-MM-JJ (dueTo exclu) ou ?noDue=true
router.get('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const filter = {};
  if (req.query.noDue === 'true') filter.dueDate = null;
  else if (req.query.dueFrom || req.query.dueTo) {
    filter.dueDate = {};
    if (req.query.dueFrom) filter.dueDate.$gte = parseDate(req.query.dueFrom, 'dueFrom');
    if (req.query.dueTo) filter.dueDate.$lt = parseDate(req.query.dueTo, 'dueTo');
  }
  res.json(await repo(req).tasks.listByProject(project._id, filter));
});

router.post('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const set = parseTask(req.body, project, false);
  const status = set.status || project.columns[0];
  const task = await repo(req).tasks.create({
    description: '', assigneeId: null, priority: 'medium', dueDate: null, labels: [],
    ...set, projectId: project._id, status, position: await repo(req).tasks.nextPosition(project._id, status),
    completedAt: status === lastColumn(project) ? new Date() : null,
  });
  await logActivity(req, project._id, 'task.created', { taskId: task._id, title: task.title, status });
  res.status(201).json(task);
});

router.get('/tasks/:id', async (req, res) => {
  res.json((await loadTask(req)).task);
});

router.patch('/tasks/:id', async (req, res) => {
  const { task, project } = await loadTask(req);
  const set = parseTask(req.body, project, true);
  // Seuls les champs réellement modifiés sont journalisés.
  const changed = Object.keys(set).filter((k) => JSON.stringify(set[k]) !== JSON.stringify(task[k] ?? null));
  if (!Object.keys(set).length) throw badRequest('Aucun champ à modifier');
  if (set.status !== undefined) Object.assign(set, completion(project, task.status, set.status));
  const updated = await repo(req).tasks.update(task._id, set);
  if (changed.includes('status')) {
    await logActivity(req, project._id, 'task.moved', { taskId: task._id, title: updated.title, from: task.status, to: set.status });
  }
  const others = changed.filter((k) => k !== 'status');
  if (others.length) await logActivity(req, project._id, 'task.updated', { taskId: task._id, title: updated.title, fields: others });
  res.json(updated);
});

// Déplacement Kanban : { status, position? }. Sans position, la carte est ajoutée en bas de la colonne.
router.patch('/tasks/:id/move', async (req, res) => {
  const { task, project } = await loadTask(req);
  const { status, position } = req.body || {};
  if (!project.columns.includes(status)) throw badRequest(`status invalide (attendu : ${project.columns.join(', ')})`);
  if (position !== undefined && (typeof position !== 'number' || !Number.isFinite(position))) {
    throw badRequest('position doit être un nombre');
  }
  const newPosition = position ?? await repo(req).tasks.nextPosition(project._id, status);
  const updated = await repo(req).tasks.update(task._id, { status, position: newPosition, ...completion(project, task.status, status) });
  if (status !== task.status) {
    await logActivity(req, project._id, 'task.moved', { taskId: task._id, title: task.title, from: task.status, to: status });
  }
  res.json(updated);
});

router.delete('/tasks/:id', async (req, res) => {
  const { task, project } = await loadTask(req);
  await repo(req).tasks.remove(task._id);
  await logActivity(req, project._id, 'task.deleted', { taskId: task._id, title: task.title });
  res.status(204).end();
});

router.post('/tasks/:id/comments', async (req, res) => {
  const { task, project } = await loadTask(req);
  const { text } = req.body || {};
  if (!isStr(text)) throw badRequest('text requis');
  const updated = await repo(req).tasks.addComment(task._id, { userId: req.auth.userId, text: text.trim(), at: new Date() });
  await logActivity(req, project._id, 'comment.added', { taskId: task._id, title: task.title });
  res.status(201).json(updated);
});

// --- Checklist ----------------------------------------------------------------

router.post('/tasks/:id/checklist', async (req, res) => {
  const { task } = await loadTask(req);
  const { text } = req.body || {};
  if (!isStr(text)) throw badRequest('text requis');
  if ((task.checklist || []).length >= MAX_CHECKLIST) throw new HttpError(409, `${MAX_CHECKLIST} éléments maximum`);
  res.status(201).json(await repo(req).tasks.addChecklistItem(task._id, { _id: new ObjectId(), text: text.trim(), done: false }));
});

router.patch('/tasks/:id/checklist/:itemId', async (req, res) => {
  const { task, project } = await loadTask(req);
  const itemId = idParam(req.params.itemId);
  const item = (task.checklist || []).find((i) => i._id.equals(itemId));
  if (!item) throw notFound();
  const { text, done } = req.body || {};
  const set = {};
  if (text !== undefined) { if (!isStr(text)) throw badRequest('text invalide'); set.text = text.trim(); }
  if (done !== undefined) { if (typeof done !== 'boolean') throw badRequest('done doit être un booléen'); set.done = done; }
  if (!Object.keys(set).length) throw badRequest('Aucun champ à modifier');
  const updated = await repo(req).tasks.updateChecklistItem(task._id, itemId, set);
  if (set.done === true && !item.done) {
    await logActivity(req, project._id, 'checklist.checked', { taskId: task._id, title: task.title, item: set.text || item.text });
  }
  res.json(updated);
});

router.delete('/tasks/:id/checklist/:itemId', async (req, res) => {
  const { task } = await loadTask(req);
  const updated = await repo(req).tasks.removeChecklistItem(task._id, idParam(req.params.itemId));
  if (!updated) throw notFound();
  res.json(updated);
});

// --- Pièces jointes (GridFS) --------------------------------------------------
// Envoi en binaire brut (application/octet-stream) ; nom et type réels dans les en-têtes
// X-File-Name (encodé URI) et X-File-Type. Pas de dépendance multipart nécessaire.

router.post('/tasks/:id/attachments', express.raw({ type: () => true, limit: MAX_FILE_SIZE }), async (req, res) => {
  const { task, project } = await loadTask(req);
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw badRequest('Fichier vide ou absent');
  if ((task.attachments || []).length >= MAX_ATTACHMENTS) throw new HttpError(409, `${MAX_ATTACHMENTS} pièces jointes maximum par tâche`);
  let name = '';
  try { name = decodeURIComponent(req.get('X-File-Name') || ''); } catch { /* nom mal encodé */ }
  name = name.replace(/[\\/\r\n"\0]/g, '_').trim().slice(0, 200);
  if (!name) throw badRequest('En-tête X-File-Name requis');
  const rawType = req.get('X-File-Type') || '';
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(rawType) ? rawType : 'application/octet-stream';

  const fileId = await repo(req).files.upload(req.body, name,
    { projectId: project._id, taskId: task._id, contentType, uploadedBy: req.auth.userId });
  const updated = await repo(req).tasks.addAttachment(task._id,
    { _id: fileId, name, size: req.body.length, contentType, uploadedBy: req.auth.userId, at: new Date() });
  await logActivity(req, project._id, 'attachment.added', { taskId: task._id, title: task.title, name });
  res.status(201).json(updated);
});

// Téléchargement : toujours en pièce jointe, jamais interprété par le navigateur (pas de XSS via un fichier HTML).
router.get('/attachments/:fileId', async (req, res) => {
  const file = await repo(req).files.get(idParam(req.params.fileId));
  if (!file) throw notFound();
  await loadProject(req, file.metadata.projectId.toString());
  res.set({
    'Content-Type': file.metadata.contentType || 'application/octet-stream',
    'Content-Length': file.length,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  await pipeline(repo(req).files.openDownload(file._id), res);
});

router.delete('/tasks/:id/attachments/:fileId', async (req, res) => {
  const { task, project } = await loadTask(req);
  const fileId = idParam(req.params.fileId);
  const meta = (task.attachments || []).find((a) => a._id.equals(fileId));
  if (!meta) throw notFound();
  const updated = await repo(req).tasks.removeAttachment(task._id, fileId);
  await repo(req).files.removeWhere({ _id: fileId, 'metadata.taskId': task._id });
  await logActivity(req, project._id, 'attachment.removed', { taskId: task._id, title: task.title, name: meta.name });
  res.json(updated);
});

module.exports = router;
