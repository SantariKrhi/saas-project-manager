const express = require('express');
const config = require('./config');
const { connect, getDb } = require('./db');

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

connect()
  .then(() => app.listen(config.port, () => console.log(`API sur le port ${config.port}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
