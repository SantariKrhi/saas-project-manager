// Toute la configuration vient de l'environnement : aucune URI en dur dans le code.
module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/saas',
  mongoDb: process.env.MONGO_DB || 'saas',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
};
