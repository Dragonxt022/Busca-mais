if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

module.exports = {
  port: parseInt(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_STORAGE || './database.sqlite',
  },
  
  typesense: {
    host: process.env.TYPESENSE_HOST || 'localhost',
    port: parseInt(process.env.TYPESENSE_PORT) || 8108,
    apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
    protocol: 'http',
    collectionName: 'pages',
  },
  
  crawler: {
    apiUrl: process.env.CRAWLER_API_URL || 'http://localhost:3001',
    externalUrl: process.env.CRAWLER_EXTERNAL_URL || 'http://localhost:3001',
  },
};
