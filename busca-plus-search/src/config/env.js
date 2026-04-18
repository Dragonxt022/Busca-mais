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

  ai: {
    provider: (process.env.AI_PROVIDER || 'ollama').toLowerCase(),
    summaryMaxCharacters: parseInt(process.env.AI_SUMMARY_MAX_CHARACTERS, 10) || 12000,
    google: {
      apiKey: process.env.GOOGLE_AI_API_KEY || '',
      model: process.env.GOOGLE_AI_MODEL || 'gemini-2.0-flash',
      apiUrl: process.env.GOOGLE_AI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    },
  },
};
