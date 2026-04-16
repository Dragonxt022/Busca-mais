const Typesense = require('typesense');
const config = require('./env');

const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: config.typesense.host,
      port: config.typesense.port,
      protocol: config.typesense.protocol,
    },
  ],
  apiKey: config.typesense.apiKey,
  connectionTimeoutSeconds: 10,
});

const COLLECTION_NAME = 'pages';

module.exports = {
  typesense: typesenseClient,
  COLLECTION_NAME,
};
