const env = require('./env');

module.exports = {
  env: env,
  server: {
    port: env.port,
    nodeEnv: env.nodeEnv,
  },
  typesense: {
    collectionName: env.typesense.collectionName,
  },
  crawler: {
    apiUrl: env.crawler.apiUrl,
    externalUrl: env.crawler.externalUrl,
  },
};
