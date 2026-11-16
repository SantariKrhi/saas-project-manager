const { PRIORITIES, ROLES } = require('./lib/constants');

// Validators $jsonSchema, appliqués par l'application à chaque démarrage (comme les index) :
// ils suivent MONGO_DB et fonctionnent aussi derrière un replica set ou un mongos (Partie II),
// là où un script docker-entrypoint-initdb.d ne serait jamais exécuté.
const schemas = {
  companies: {
    bsonType: 'object',
    required: ['name', 'slug', 'createdAt'],
    properties: {
      name: { bsonType: 'string', minLength: 1 },
      slug: { bsonType: 'string', pattern: '^[a-z0-9-]+$' },
      createdAt: { bsonType: 'date' },
    },
  },
  users: {
    bsonType: 'object',
    required: ['companyId', 'email', 'passwordHash', 'firstName', 'lastName', 'role', 'createdAt'],
    properties: {
      companyId: { bsonType: 'objectId' },
      email: { bsonType: 'string' },
      passwordHash: { bsonType: 'string' },
      firstName: { bsonType: 'string' },
      lastName: { bsonType: 'string' },
      role: { enum: ROLES },
      createdAt: { bsonType: 'date' },
    },
  },
  projects: {
    bsonType: 'object',
    required: ['companyId', 'name', 'memberIds', 'columns', 'createdAt'],
    properties: {
      companyId: { bsonType: 'objectId' },
      name: { bsonType: 'string', minLength: 1 },
      description: { bsonType: 'string' },
      memberIds: { bsonType: 'array', items: { bsonType: 'objectId' } },
      columns: { bsonType: 'array', minItems: 1, items: { bsonType: 'string' } },
      createdAt: { bsonType: 'date' },
    },
  },
  tasks: {
    bsonType: 'object',
    required: ['companyId', 'projectId', 'title', 'status', 'position', 'createdAt'],
    properties: {
      companyId: { bsonType: 'objectId' },
      projectId: { bsonType: 'objectId' },
      title: { bsonType: 'string', minLength: 1 },
      description: { bsonType: 'string' },
      status: { bsonType: 'string' },
      position: { bsonType: ['int', 'long', 'double'] },
      assigneeId: { bsonType: ['objectId', 'null'] },
      priority: { enum: PRIORITIES },
      dueDate: { bsonType: ['date', 'null'] },
      labels: { bsonType: 'array', items: { bsonType: 'string' } },
      comments: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['userId', 'text', 'at'],
          properties: {
            userId: { bsonType: 'objectId' },
            text: { bsonType: 'string' },
            at: { bsonType: 'date' },
          },
        },
      },
      checklist: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['_id', 'text', 'done'],
          properties: { _id: { bsonType: 'objectId' }, text: { bsonType: 'string', minLength: 1 }, done: { bsonType: 'bool' } },
        },
      },
      // Métadonnées des pièces jointes ; le contenu est dans GridFS (attachments.files / attachments.chunks)
      attachments: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          required: ['_id', 'name', 'size', 'contentType', 'uploadedBy', 'at'],
          properties: {
            _id: { bsonType: 'objectId' },
            name: { bsonType: 'string' },
            size: { bsonType: ['int', 'long', 'double'] },
            contentType: { bsonType: 'string' },
            uploadedBy: { bsonType: 'objectId' },
            at: { bsonType: 'date' },
          },
        },
      },
      completedAt: { bsonType: ['date', 'null'] },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
  // Journal d'activité (purgé automatiquement par un index TTL sur `at`)
  activities: {
    bsonType: 'object',
    required: ['companyId', 'projectId', 'userId', 'type', 'at'],
    properties: {
      companyId: { bsonType: 'objectId' },
      projectId: { bsonType: 'objectId' },
      userId: { bsonType: 'objectId' },
      type: { bsonType: 'string' },
      data: { bsonType: 'object' },
      at: { bsonType: 'date' },
    },
  },
};

// Crée la collection avec son validator, ou met à jour le validator si elle existe déjà (idempotent).
// À appeler AVANT les index et le seed, qui créeraient sinon les collections sans validator.
async function ensureValidators(db) {
  for (const [name, schema] of Object.entries(schemas)) {
    const validator = { $jsonSchema: schema };
    try {
      await db.createCollection(name, { validator });
    } catch (err) {
      if (err.codeName !== 'NamespaceExists') throw err;
      await db.command({ collMod: name, validator });
    }
  }
}

module.exports = { ensureValidators };
