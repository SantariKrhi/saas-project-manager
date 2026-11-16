const path = require('path');
const express = require('express');
const config = require('./config');
const { connect, getDb } = require('./db');
const { seed } = require('./seed');
const { ensureValidators } = require('./validators');
const { ensureIndexes } = require('./indexes');
const { HttpError } = require('./lib/http');

const app = express();
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await getDb().command({ ping: 1 });
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/company', require('./routes/company'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api', require('./routes/tasks'));
app.use('/api', require('./routes/insights'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

// Interface web (fichiers statiques, sans étape de build)
app.use(express.static(path.join(__dirname, 'public')));

// Express 5 transmet automatiquement les erreurs des handlers async à ce middleware.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Fichier trop volumineux (10 Mo maximum)' });
  console.error(err);
  res.status(500).json({ error: 'Erreur interne' });
});

connect()
  // Ordre important : validators, puis index, puis seed (sinon les collections seraient créées sans validator).
  .then(async (db) => { await ensureValidators(db); await ensureIndexes(db); await seed(db); })
  .then(() => app.listen(config.port, () => console.log(`API sur le port ${config.port}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
