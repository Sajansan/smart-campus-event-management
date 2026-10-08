const fs = require('node:fs');
const path = require('node:path');

module.exports = function dbOptions(env = process.env) {
  const options = {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    dateStrings: true,
    connectTimeout: 15000,
  };
  if (env.DB_SSL_CA) {
    options.ssl = {
      ca: fs.readFileSync(path.resolve(__dirname, '../..', env.DB_SSL_CA)),
      rejectUnauthorized: true,
      verifyIdentity: true,
    };
  }
  return options;
};
