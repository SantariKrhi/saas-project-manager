const express = require('express');
const config = require('./config');
const { connect, getDb } = require('./db');
const { seed } = require('./seed');

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

// Express 5 transmet automatiquement les erreurs des handlers async à ce middleware.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur interne' });
});

connect()
  .then(seed)
  .then(() => app.listen(config.port, () => console.log(`API sur le port ${config.port}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
