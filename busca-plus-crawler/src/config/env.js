if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_STORAGE || './database.sqlite',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    name: process.env.DB_NAME || 'busca_plus',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
  },
  
  redis: {
    host: process.env.REDIS_HOST || (process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : 'localhost'),
    port: parseInt(process.env.REDIS_PORT) || (process.env.REDIS_URL ? parseInt(new URL(process.env.REDIS_URL).port) : 6379),
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  typesense: {
    host: process.env.TYPESENSE_HOST || 'localhost',
    port: parseInt(process.env.TYPESENSE_PORT) || 8108,
    apiKey: process.env.TYPESENSE_API_KEY || 'xyz',
    protocol: 'http',
  },
  
  crawler: {
    timeout: parseInt(process.env.CRAWLER_TIMEOUT) || 30000,
    maxDepth: parseInt(process.env.CRAWLER_MAX_DEPTH) || 3,
    maxPages: parseInt(process.env.CRAWLER_MAX_PAGES) || 100,
    screenshotsDir: process.env.SCREENSHOTS_DIR || './public/screenshots',
  },
  
  security: {
    allowedDomains: process.env.ALLOWED_DOMAINS || '*',
  },
};