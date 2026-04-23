const BASE = process.env.APP_BASE_DIR
  || '/home/cipilimitada-bucamais/htdocs/bucamais.cipilimitada.com.br';

const infra = {
  NODE_ENV:          'production',
  DB_DIALECT:        'postgres',
  DB_HOST:           process.env.DB_HOST           || 'localhost',
  DB_PORT:           process.env.DB_PORT           || '5432',
  DB_NAME:           process.env.POSTGRES_DB       || 'buscaplus',
  DB_USER:           process.env.POSTGRES_USER     || 'buscaplus',
  DB_PASS:           process.env.POSTGRES_PASSWORD,
  REDIS_HOST:        process.env.REDIS_HOST        || 'localhost',
  REDIS_PORT:        process.env.REDIS_PORT        || '6379',
  TYPESENSE_HOST:    process.env.TYPESENSE_HOST    || 'localhost',
  TYPESENSE_PORT:    process.env.TYPESENSE_PORT    || '8108',
  TYPESENSE_API_KEY: process.env.TYPESENSE_API_KEY,
};

module.exports = {
  apps: [
    // admin.buscamais.cipilimitada.com.br → porta 3001
    {
      name:       'busca-crawler',
      script:     'src/index.js',
      cwd:        `${BASE}/busca-plus-crawler`,
      instances:  1,
      exec_mode:  'fork',
      env:        { ...infra, PORT: '3001' },
      error_file: `${BASE}/busca-plus/logs/crawler-error.log`,
      out_file:   `${BASE}/busca-plus/logs/crawler-out.log`,
    },

    // Worker de fila — sem porta, processa jobs em background
    {
      name:       'busca-worker',
      script:     'src/workers/index.js',
      cwd:        `${BASE}/busca-plus-crawler`,
      instances:  1,
      exec_mode:  'fork',
      env:        infra,
      error_file: `${BASE}/busca-plus/logs/worker-error.log`,
      out_file:   `${BASE}/busca-plus/logs/worker-out.log`,
    },

    // buscamais.cipilimitada.com.br → porta 3002
    {
      name:       'busca-search',
      script:     'src/index.js',
      cwd:        `${BASE}/busca-plus-search`,
      instances:  1,
      exec_mode:  'fork',
      env: {
        ...infra,
        PORT:                      '3002',
        CRAWLER_API_URL:           'http://localhost:3001',
        CRAWLER_EXTERNAL_URL:      'https://admin.buscamais.cipilimitada.com.br',
        AI_PROVIDER:               process.env.AI_PROVIDER              || 'ollama',
        OLLAMA_BASE_URL:           process.env.OLLAMA_BASE_URL          || 'http://localhost:11434',
        OLLAMA_MODEL:              process.env.OLLAMA_MODEL             || 'llama3.1:8b',
        GOOGLE_AI_API_KEY:         process.env.GOOGLE_AI_API_KEY        || '',
        GOOGLE_AI_MODEL:           process.env.GOOGLE_AI_MODEL          || 'gemini-2.0-flash',
        AI_SUMMARY_MAX_CHARACTERS: process.env.AI_SUMMARY_MAX_CHARACTERS|| '12000',
      },
      error_file: `${BASE}/busca-plus/logs/search-error.log`,
      out_file:   `${BASE}/busca-plus/logs/search-out.log`,
    },
  ],
};
