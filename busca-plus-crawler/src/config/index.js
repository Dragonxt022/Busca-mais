const env = require('./env');

module.exports = {
  env: env,
  server: {
    port: env.port,
    nodeEnv: env.nodeEnv,
  },
  database: require('./database'),
  redis: require('./redis'),
  typesense: require('./typesense'),
};
