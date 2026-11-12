// Exécuté automatiquement au premier démarrage de Mongo (volume vide).
// Crée les collections avec leurs validators $jsonSchema.
// Pour rejouer : docker compose down -v
const database = db.getSiblingDB('saas');

const schemas = {
  companies: {
    bsonType: 'object',
    required: ['name', 'slug', 'createdAt'],
    properties: {
      name: { bsonType: 'string', minLength: 1 },
      slug: { bsonType: 'string', pattern: '^[a-z0-9-]+$' },
      plan: { enum: ['free', 'pro'] },
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
      role: { enum: ['admin', 'member'] },
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
      createdBy: { bsonType: 'objectId' },
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
      priority: { enum: ['low', 'medium', 'high'] },
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

Object.entries(schemas).forEach(([name, schema]) => {
  database.createCollection(name, { validator: { $jsonSchema: schema } });
});

// Les index sont créés par l'application au démarrage (app/src/indexes.js), y compris sur une base existante.
