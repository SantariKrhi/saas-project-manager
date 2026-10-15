// Exécuté automatiquement au premier démarrage de Mongo (volume vide).
// Crée les collections avec leurs validators $jsonSchema, puis les index.
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
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
};

Object.entries(schemas).forEach(([name, schema]) => {
  database.createCollection(name, { validator: { $jsonSchema: schema } });
});

// Index (isolation multi-tenant : companyId toujours en préfixe)
database.companies.createIndex({ slug: 1 }, { unique: true });
database.users.createIndex({ companyId: 1, email: 1 }, { unique: true });
database.projects.createIndex({ companyId: 1, _id: 1 });
database.tasks.createIndex({ companyId: 1, projectId: 1, status: 1, position: 1 });
