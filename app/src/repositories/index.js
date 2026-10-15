const { getDb } = require('../db');

// Point d'entrée UNIQUE vers les données métier.
// Un repository est construit pour une entreprise donnée : chaque requête est filtrée par
// companyId (placé en dernier dans le filtre pour qu'il ne puisse jamais être écrasé).
// Les routes n'ont jamais accès à db.collection() : l'isolation ne dépend pas de la vigilance de chacune.
function forCompany(db, companyId) {
  const c = (name) => db.collection(name);
  const scope = (filter = {}) => ({ ...filter, companyId });
  const noHash = { projection: { passwordHash: 0 } };
  const strip = ({ passwordHash, ...rest }) => rest;

  const users = {
    list: () => c('users').find(scope(), noHash).sort({ lastName: 1, firstName: 1 }).toArray(),
    get: (id) => c('users').findOne(scope({ _id: id }), noHash),
    getMany: (ids) => c('users').find(scope({ _id: { $in: ids } }), noHash).toArray(),
    countAdmins: () => c('users').countDocuments(scope({ role: 'admin' })),
    async create(doc) {
      const user = { ...doc, companyId, createdAt: new Date() };
      await c('users').insertOne(user);
      return strip(user);
    },
    update: (id, set) =>
      c('users').findOneAndUpdate(scope({ _id: id }), { $set: set }, { returnDocument: 'after', ...noHash }),
    // Suppression en cascade : retrait des projets et désassignation des tâches.
    async remove(id) {
      const { deletedCount } = await c('users').deleteOne(scope({ _id: id }));
      if (!deletedCount) return false;
      await c('projects').updateMany(scope(), { $pull: { memberIds: id } });
      await c('tasks').updateMany(scope({ assigneeId: id }), { $set: { assigneeId: null, updatedAt: new Date() } });
      return true;
    },
  };

  const projects = {
    list: (extra = {}) => c('projects').find(scope(extra)).sort({ createdAt: -1 }).toArray(),
    get: (id) => c('projects').findOne(scope({ _id: id })),
    async create(doc) {
      const project = { ...doc, companyId, createdAt: new Date() };
      await c('projects').insertOne(project);
      return project;
    },
    update: (id, set) => c('projects').findOneAndUpdate(scope({ _id: id }), { $set: set }, { returnDocument: 'after' }),
    // Les membres retirés perdent leurs assignations dans ce projet.
    async setMembers(project, memberIds) {
      const removed = project.memberIds.filter((m) => !memberIds.some((n) => n.equals(m)));
      if (removed.length) {
        await c('tasks').updateMany(scope({ projectId: project._id, assigneeId: { $in: removed } }),
          { $set: { assigneeId: null, updatedAt: new Date() } });
      }
      return c('projects').findOneAndUpdate(scope({ _id: project._id }), { $set: { memberIds } }, { returnDocument: 'after' });
    },
    async remove(id) {
      const { deletedCount } = await c('projects').deleteOne(scope({ _id: id }));
      if (!deletedCount) return false;
      await c('tasks').deleteMany(scope({ projectId: id }));
      return true;
    },
  };

  const tasks = {
    listByProject: (projectId, extra = {}) =>
      c('tasks').find(scope({ ...extra, projectId })).sort({ position: 1 }).toArray(),
    get: (id) => c('tasks').findOne(scope({ _id: id })),
    async create(doc) {
      const now = new Date();
      const task = { ...doc, companyId, comments: [], createdAt: now, updatedAt: now };
      await c('tasks').insertOne(task);
      return task;
    },
    update: (id, set) =>
      c('tasks').findOneAndUpdate(scope({ _id: id }), { $set: { ...set, updatedAt: new Date() } }, { returnDocument: 'after' }),
    addComment: (id, comment) =>
      c('tasks').findOneAndUpdate(scope({ _id: id }), { $push: { comments: comment }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }),
    async remove(id) {
      const { deletedCount } = await c('tasks').deleteOne(scope({ _id: id }));
      return deletedCount > 0;
    },
    countByStatuses: (projectId, statuses) => c('tasks').countDocuments(scope({ projectId, status: { $in: statuses } })),
    async nextPosition(projectId, status) {
      const [last] = await c('tasks').find(scope({ projectId, status })).sort({ position: -1 }).limit(1).toArray();
      return last ? last.position + 1024 : 1024;
    },
  };

  const company = {
    get: () => c('companies').findOne({ _id: companyId }),
    update: (set) => c('companies').findOneAndUpdate({ _id: companyId }, { $set: set }, { returnDocument: 'after' }),
    async removeAll() {
      await c('tasks').deleteMany(scope());
      await c('projects').deleteMany(scope());
      await c('users').deleteMany(scope());
      await c('companies').deleteOne({ _id: companyId });
    },
  };

  return { users, projects, tasks, company };
}

// Raccourci pour les routes : repository de l'entreprise issue du token.
const repo = (req) => forCompany(getDb(), req.auth.companyId);

module.exports = { forCompany, repo };
