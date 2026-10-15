const { MongoClient } = require('mongodb');
const config = require('./config');

let client;
let db;

// Connexion avec retry : Mongo (ou un cluster) peut mettre du temps à être prêt.
async function connect(retries = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      client = new MongoClient(config.mongoUri);
      await client.connect();
      db = client.db(config.mongoDb);
      await db.command({ ping: 1 });
      console.log('MongoDB connecté');
      return db;
    } catch (err) {
      console.error(`Connexion MongoDB échouée (${attempt}/${retries}) : ${err.message}`);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function getDb() {
  if (!db) throw new Error('Base non initialisée');
  return db;
}

module.exports = { connect, getDb };
