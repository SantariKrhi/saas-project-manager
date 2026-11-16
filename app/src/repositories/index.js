const { GridFSBucket, ObjectId } = require('mongodb');
const { getDb } = require('../db');
const { DAY_MS: DAY } = require('../lib/constants');

const PRIORITY_RANK = { $switch: { branches: [
  { case: { $eq: ['$priority', 'high'] }, then: 0 },
  { case: { $eq: ['$priority', 'medium'] }, then: 1 },
], default: 2 } };

// Point d'entrée UNIQUE vers les données métier.
// Un repository est construit pour une entreprise donnée : chaque requête est filtrée par
// companyId (placé en dernier dans le filtre pour qu'il ne puisse jamais être écrasé).
// Les routes n'ont jamais accès à db.collection() : l'isolation ne dépend pas de la vigilance de chacune.
function forCompany(db, companyId) {
  const c = (name) => db.collection(name);
  const scope = (filter = {}) => ({ ...filter, companyId });
  const noHash = { projection: { passwordHash: 0 } };
  const strip = ({ passwordHash, ...rest }) => rest;
  const after = { returnDocument: 'after' };
  const bucket = new GridFSBucket(db, { bucketName: 'attachments' });

  // $lookup restreint à l'entreprise : même une jointure ne peut pas sortir du périmètre.
  const lookupScoped = (from, localField, as, project) => ({
    $lookup: {
      from, let: { id: `$${localField}` }, as,
      pipeline: [{ $match: { companyId, $expr: { $eq: ['$_id', '$$id'] } } }, { $project: project }],
    },
  });

  // ------------------------------------------------------------------ fichiers (GridFS)
  // Les métadonnées de chaque fichier portent companyId / projectId / taskId : isolation et cascades.
  const files = {
    upload: (buffer, filename, metadata) => new Promise((resolve, reject) => {
      const stream = bucket.openUploadStream(filename, { metadata: { ...metadata, companyId } });
      stream.once('finish', () => resolve(stream.id));
      stream.once('error', reject);
      stream.end(buffer);
    }),
    get: (fileId) => c('attachments.files').findOne({ _id: fileId, 'metadata.companyId': companyId }),
    openDownload: (fileId) => bucket.openDownloadStream(fileId),
    async removeWhere(filter) {
      const found = await c('attachments.files').find({ ...filter, 'metadata.companyId': companyId }, { projection: { _id: 1 } }).toArray();
      for (const f of found) await bucket.delete(f._id);
      return found.length;
    },
  };

  // ------------------------------------------------------------------ journal d'activité
  // Collection dédiée ; un index TTL sur `at` supprime automatiquement les entrées anciennes.
  const activities = {
    log: (entry) => c('activities').insertOne({ ...entry, companyId, at: entry.at || new Date() }),
    list: (projectId, { before, limit }) =>
      c('activities').find(scope({ projectId, ...(before && { at: { $lt: before } }) })).sort({ at: -1 }).limit(limit).toArray(),
  };

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
      c('users').findOneAndUpdate(scope({ _id: id }), { $set: set }, { ...after, ...noHash }),
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
    update: (id, set) => c('projects').findOneAndUpdate(scope({ _id: id }), { $set: set }, after),
    // Les membres retirés perdent leurs assignations dans ce projet.
    async setMembers(project, memberIds) {
      const removed = project.memberIds.filter((m) => !memberIds.some((n) => n.equals(m)));
      if (removed.length) {
        await c('tasks').updateMany(scope({ projectId: project._id, assigneeId: { $in: removed } }),
          { $set: { assigneeId: null, updatedAt: new Date() } });
      }
      return c('projects').findOneAndUpdate(scope({ _id: project._id }), { $set: { memberIds } }, after);
    },
    async remove(id) {
      const { deletedCount } = await c('projects').deleteOne(scope({ _id: id }));
      if (!deletedCount) return false;
      await c('tasks').deleteMany(scope({ projectId: id }));
      await c('activities').deleteMany(scope({ projectId: id }));
      await files.removeWhere({ 'metadata.projectId': id });
      return true;
    },
  };

  const tasks = {
    listByProject: (projectId, extra = {}) =>
      c('tasks').find(scope({ ...extra, projectId })).sort({ position: 1 }).toArray(),
    get: (id) => c('tasks').findOne(scope({ _id: id })),
    async create(doc) {
      const now = new Date();
      const task = { checklist: [], attachments: [], completedAt: null, ...doc, companyId, comments: [], createdAt: now, updatedAt: now };
      await c('tasks').insertOne(task);
      return task;
    },
    update: (id, set) =>
      c('tasks').findOneAndUpdate(scope({ _id: id }), { $set: { ...set, updatedAt: new Date() } }, after),
    addComment: (id, comment) =>
      c('tasks').findOneAndUpdate(scope({ _id: id }), { $push: { comments: comment }, $set: { updatedAt: new Date() } }, after),
    async remove(id) {
      const { deletedCount } = await c('tasks').deleteOne(scope({ _id: id }));
      if (deletedCount) await files.removeWhere({ 'metadata.taskId': id });
      return deletedCount > 0;
    },
    countByStatuses: (projectId, statuses) => c('tasks').countDocuments(scope({ projectId, status: { $in: statuses } })),
    // Renommage de colonnes : passage par un statut temporaire pour gérer les échanges (a -> b et b -> a).
    async renameStatuses(projectId, renames) {
      const tmp = renames.map((r, i) => ({ ...r, tmp: `__renommage_${Date.now()}_${i}` }));
      for (const r of tmp) await c('tasks').updateMany(scope({ projectId, status: r.from }), { $set: { status: r.tmp } });
      for (const r of tmp) await c('tasks').updateMany(scope({ projectId, status: r.tmp }), { $set: { status: r.to, updatedAt: new Date() } });
    },
    async nextPosition(projectId, status) {
      const [last] = await c('tasks').find(scope({ projectId, status })).sort({ position: -1 }).limit(1).toArray();
      return last ? last.position + 1024 : 1024;
    },

    // --- Checklist : éléments imbriqués, modifiés un par un grâce aux arrayFilters
    addChecklistItem: (id, item) =>
      c('tasks').findOneAndUpdate(scope({ _id: id }), { $push: { checklist: item }, $set: { updatedAt: new Date() } }, after),
    updateChecklistItem: (id, itemId, set) => c('tasks').findOneAndUpdate(
      scope({ _id: id, 'checklist._id': itemId }),
      { $set: { ...Object.fromEntries(Object.entries(set).map(([k, v]) => [`checklist.$[item].${k}`, v])), updatedAt: new Date() } },
      { ...after, arrayFilters: [{ 'item._id': itemId }] },
    ),
    removeChecklistItem: (id, itemId) =>
      c('tasks').findOneAndUpdate(scope({ _id: id, 'checklist._id': itemId }), { $pull: { checklist: { _id: itemId } }, $set: { updatedAt: new Date() } }, after),

    // --- Pièces jointes : métadonnées imbriquées dans la tâche, contenu dans GridFS
    addAttachment: (id, meta) =>
      c('tasks').findOneAndUpdate(scope({ _id: id }), { $push: { attachments: meta }, $set: { updatedAt: new Date() } }, after),
    removeAttachment: (id, fileId) =>
      c('tasks').findOneAndUpdate(scope({ _id: id, 'attachments._id': fileId }), { $pull: { attachments: { _id: fileId } }, $set: { updatedAt: new Date() } }, after),

    // --- « Mes tâches » : tâches assignées, enrichies du projet par $lookup, triées
    //     (non terminées d'abord, puis par échéance — sans échéance en dernier — puis priorité).
    mine: (userId, projectIds) => c('tasks').aggregate([
      { $match: scope({ assigneeId: userId, projectId: { $in: projectIds } }) },
      lookupScoped('projects', 'projectId', 'project', { name: 1, columns: 1 }),
      { $unwind: '$project' },
      { $set: {
        done: { $eq: ['$status', { $arrayElemAt: ['$project.columns', -1] }] },
        noDue: { $eq: [{ $ifNull: ['$dueDate', null] }, null] },
        priorityRank: PRIORITY_RANK,
      } },
      { $sort: { done: 1, noDue: 1, dueDate: 1, priorityRank: 1, title: 1 } },
      { $project: { comments: 0, noDue: 0, priorityRank: 0 } },
    ]).toArray(),

    // --- Recherche plein texte : index texte français, résultats triés par score de pertinence.
    search: (text, projectIds, limit = 20) => c('tasks').aggregate([
      { $match: scope({ $text: { $search: text }, projectId: { $in: projectIds } }) },
      { $set: { score: { $meta: 'textScore' } } },
      { $sort: { score: -1, updatedAt: -1 } },
      { $limit: limit },
      lookupScoped('projects', 'projectId', 'project', { name: 1 }),
      { $unwind: '$project' },
      { $project: {
        title: 1, status: 1, priority: 1, dueDate: 1, labels: 1, projectId: 1, assigneeId: 1, project: 1,
        score: { $round: ['$score', 2] }, excerpt: { $substrCP: ['$description', 0, 140] },
      } },
    ]).toArray(),

    // --- Tableau de bord : un seul aller-retour, plusieurs agrégations parallèles via $facet.
    async stats(projectIds, { weeks = 8, timezone = 'Europe/Paris' } = {}) {
      const today = new Date(new Date().toDateString());
      const since = new Date(today.getTime() - weeks * 7 * DAY);
      const isDone = { $cond: ['$done', 1, 0] };
      const isOverdue = { $cond: ['$overdue', 1, 0] };
      const perWeek = (field) => [
        { $match: { [field]: { $gte: since } } },
        { $group: { _id: { $dateTrunc: { date: `$${field}`, unit: 'week', startOfWeek: 'monday', timezone } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ];
      const [result] = await c('tasks').aggregate([
        { $match: scope({ projectId: { $in: projectIds } }) },
        lookupScoped('projects', 'projectId', 'p', { name: 1, last: { $arrayElemAt: ['$columns', -1] } }),
        { $set: { p: { $first: '$p' } } },
        { $set: { done: { $eq: ['$status', '$p.last'] } } },
        { $set: { overdue: { $and: [{ $not: ['$done'] }, { $ne: [{ $ifNull: ['$dueDate', null] }, null] }, { $lt: ['$dueDate', today] }] } } },
        { $facet: {
          totals: [{ $group: {
            _id: null, total: { $sum: 1 }, done: { $sum: isDone }, overdue: { $sum: isOverdue },
            unassigned: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$assigneeId', null] }, null] }, 1, 0] } },
          } }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          byProject: [
            { $group: { _id: '$projectId', name: { $first: '$p.name' }, total: { $sum: 1 }, done: { $sum: isDone }, overdue: { $sum: isOverdue } } },
            { $sort: { name: 1 } },
          ],
          byAssignee: [
            { $group: { _id: '$assigneeId', total: { $sum: 1 }, done: { $sum: isDone }, overdue: { $sum: isOverdue } } },
            lookupScoped('users', '_id', 'user', { firstName: 1, lastName: 1 }),
            { $set: { user: { $first: '$user' } } },
            { $sort: { total: -1 } },
          ],
          createdPerWeek: perWeek('createdAt'),
          completedPerWeek: perWeek('completedAt'),
        } },
      ]).toArray();
      return { ...result, totals: result.totals[0] || { total: 0, done: 0, overdue: 0, unassigned: 0 }, since, weeks };
    },
  };

  const company = {
    get: () => c('companies').findOne({ _id: companyId }),
    update: (set) => c('companies').findOneAndUpdate({ _id: companyId }, { $set: set }, after),
    async removeAll() {
      await files.removeWhere({});
      await c('activities').deleteMany(scope());
      await c('tasks').deleteMany(scope());
      await c('projects').deleteMany(scope());
      await c('users').deleteMany(scope());
      await c('companies').deleteOne({ _id: companyId });
    },
  };

  return { users, projects, tasks, company, activities, files };
}

// Raccourci pour les routes : repository de l'entreprise issue du token.
const repo = (req) => forCompany(getDb(), req.auth.companyId);

// Accès AVANT authentification (inscription, connexion) : seul endroit où l'entreprise n'est pas encore connue.
// Il reste limité à ces deux opérations ; tout le reste passe par forCompany().
const accounts = {
  async findForLogin(slug, email) {
    const db = getDb();
    const company = await db.collection('companies').findOne({ slug });
    return company && db.collection('users').findOne({ companyId: company._id, email });
  },
  // Pas de transaction sur un serveur MongoDB seul : si l'admin ne peut pas être créé, on retire l'entreprise
  // pour ne pas laisser d'entreprise sans utilisateur. (Avec le replica set de la Partie II, une transaction conviendrait.)
  async registerCompany({ name, slug }, admin) {
    const db = getDb();
    const now = new Date();
    const company = { _id: new ObjectId(), name, slug, plan: 'free', createdAt: now };
    const user = { _id: new ObjectId(), ...admin, companyId: company._id, role: 'admin', createdAt: now };
    await db.collection('companies').insertOne(company);
    try {
      await db.collection('users').insertOne(user);
    } catch (err) {
      await db.collection('companies').deleteOne({ _id: company._id });
      throw err;
    }
    return { company, user };
  },
};

module.exports = { forCompany, repo, accounts };
