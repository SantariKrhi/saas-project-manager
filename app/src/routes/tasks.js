const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { repo } = require('../repositories');
const { loadProject } = require('../lib/access');
const { notFound, badRequest, idParam, toId, isStr } = require('../lib/http');

const router = express.Router();
router.use(requireAuth);

const PRIORITIES = ['low', 'medium', 'high'];

// Charge une tâche ET vérifie l'accès à son projet (404 sinon).
async function loadTask(req) {
  const task = await repo(req).tasks.get(idParam(req.params.id));
  if (!task) throw notFound();
  const project = await loadProject(req, task.projectId.toString());
  return { task, project };
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
  if (dueDate !== undefined) {
    if (dueDate === null) set.dueDate = null;
    else {
      const d = new Date(dueDate);
      if (typeof dueDate !== 'string' || Number.isNaN(d.getTime())) throw badRequest('dueDate invalide');
      set.dueDate = d;
    }
  }
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

// --- CRUD tâches -------------------------------------------------------------

router.get('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  res.json(await repo(req).tasks.listByProject(project._id));
});

router.post('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req, req.params.projectId);
  const set = parseTask(req.body, project, false);
  const status = set.status || project.columns[0];
  const task = await repo(req).tasks.create({
    description: '', assigneeId: null, priority: 'medium', dueDate: null, labels: [],
    ...set, projectId: project._id, status, position: await repo(req).tasks.nextPosition(project._id, status),
  });
  res.status(201).json(task);
});

router.get('/tasks/:id', async (req, res) => {
  res.json((await loadTask(req)).task);
});

router.patch('/tasks/:id', async (req, res) => {
  const { task, project } = await loadTask(req);
  const set = parseTask(req.body, project, true);
  if (!Object.keys(set).length) throw badRequest('Aucun champ à modifier');
  res.json(await repo(req).tasks.update(task._id, set));
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
  res.json(await repo(req).tasks.update(task._id, { status, position: newPosition }));
});

router.delete('/tasks/:id', async (req, res) => {
  const { task } = await loadTask(req);
  await repo(req).tasks.remove(task._id);
  res.status(204).end();
});

router.post('/tasks/:id/comments', async (req, res) => {
  const { task } = await loadTask(req);
  const { text } = req.body || {};
  if (!isStr(text)) throw badRequest('text requis');
  res.status(201).json(await repo(req).tasks.addComment(task._id, { userId: req.auth.userId, text: text.trim(), at: new Date() }));
});

module.exports = router;
