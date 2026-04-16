# Busca+ - Motor de Busca Inteligente

Um sistema de crawling e indexação de páginas web com interface de busca, construído com Node.js, PostgreSQL, Redis, Typesense e Playwright.

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Busca+ UI     │────▶│    Typesense    │     │   PostgreSQL    │
│   (Porta 3000)  │     │   (Porta 8108)  │     │   (Porta 5432)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                ▲                        ▲
                                │                        │
┌─────────────────┐     ┌──────┴────────┐       ┌───────┴────────┐
│     MinIO       │     │     Redis     │       │    Crawler     │
│  (Screenshots)  │     │   (Porta 6379)│       │  (Porta 3001)  │
└─────────────────┘     └───────────────┘       └────────────────┘
                                │
                        ┌───────┴────────┐
                        │     Worker     │
                        │  (Background)  │
                        └────────────────┘
```

## 📦 Microserviços

### 1. **busca-plus-crawler**
- API REST para gerenciamento de fontes e páginas
- Sistema de crawling com Playwright
- Fila de processamento com BullMQ/Redis
- Indexação automática no Typesense
- Captura de screenshots

### 2. **busca-plus-search**
- Interface web de busca
- API de busca com highlight
- Sugestões de autocompletar

## 🚀 Início Rápido

### Pré-requisitos
- Docker e Docker Compose
- Node.js 18+ (para desenvolvimento local)

### Executando com Docker

```bash
# Clone o repositório
cd busca-plus

# Inicie todos os serviços
docker-compose up -d

# Verifique os logs
docker-compose logs -f
```

### Acessos

| Serviço | URL |
|---------|-----|
| Interface de Busca | http://localhost:3000 |
| API do Crawler | http://localhost:3001 |
| MinIO Console | http://localhost:9001 |
| Typesense API | http://localhost:8108 |

## 📋 API Endpoints

### Crawler API (Porta 3001)

#### Sources (Fontes)

```http
# Listar todas as fontes
GET /api/sources

# Criar nova fonte
POST /api/sources
Content-Type: application/json
{
  "name": "Exemplo Blog",
  "baseUrl": "https://exemplo.com",
  "description": "Blog de exemplo"
}

# Obter fonte por ID
GET /api/sources/:id

# Atualizar fonte
PUT /api/sources/:id

# Deletar fonte
DELETE /api/sources/:id

# Iniciar crawling de uma fonte
POST /api/sources/:id/crawl
```

#### Pages (Páginas)

```http
# Listar páginas
GET /api/pages?sourceId=1&page=1&limit=20

# Obter página por ID
GET /api/pages/:id

# Buscar páginas (busca simples)
GET /api/pages/search?q=termo

# Deletar página
DELETE /api/pages/:id
```

### Search UI (Porta 3000)

```http
# Página inicial com busca
GET /?q=termo&page=1

# Ver detalhes de uma página
GET /page/:id

# API de sugestões
GET /api/suggestions?q=ter
```

## 🔧 Configuração

### Variáveis de Ambiente - Crawler

```env
# Servidor
PORT=3001
NODE_ENV=development

# Banco de dados
DATABASE_URL=postgres://usuario:senha@localhost:5432/buscaplus

# Redis
REDIS_URL=redis://localhost:6379

# Typesense
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=sua_api_key

# MinIO (Screenshots)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_USE_SSL=false
MINIO_BUCKET=screenshots

# Logging
LOG_LEVEL=info
```

### Variáveis de Ambiente - Search UI

```env
# Servidor
PORT=3000
NODE_ENV=development

# Typesense
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_API_KEY=sua_api_key

# Crawler API
CRAWLER_API_URL=http://localhost:3001
```

## 🗄️ Banco de Dados

### Tabelas

#### `sources`
```sql
- id (PK)
- name
- baseUrl
- description
- isActive
- crawlConfig (JSON)
- createdAt
- updatedAt
```

#### `pages`
```sql
- id (PK)
- sourceId (FK)
- url
- title
- description
- content
- keywords (Array)
- screenshotPath
- crawledAt
- createdAt
- updatedAt
```

#### `crawl_jobs`
```sql
- id (PK)
- sourceId (FK)
- status
- pagesFound
- pagesCrawled
- errors (JSON)
- startedAt
- completedAt
```

#### `search_logs`
```sql
- id (PK)
- query
- resultsCount
- source
- createdAt
```

## 🔍 Typesense Schema

```javascript
{
  name: 'pages',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'content', type: 'string' },
    { name: 'url', type: 'string' },
    { name: 'sourceId', type: 'int32' },
    { name: 'sourceName', type: 'string' },
    { name: 'keywords', type: 'string[]' },
    { name: 'crawledAt', type: 'int64' }
  ]
}
```

## 🛠️ Desenvolvimento Local

```bash
# Instale as dependências do crawler
cd busca-plus-crawler
npm install

# Instale as dependências do search
cd ../busca-plus-search
npm install

# Execute as migrations (após PostgreSQL estar rodando)
cd ../busca-plus-crawler
npx sequelize-cli db:migrate

# Inicie o crawler
npm run dev

# Em outro terminal, inicie o worker
npm run worker

# Em outro terminal, inicie o search-ui
cd ../busca-plus-search
npm run dev
```

## 📊 Fluxo de Crawling

1. **Criação da Fonte**: POST `/api/sources` cria uma nova fonte
2. **Início do Crawling**: POST `/api/sources/:id/crawl` inicia o processo
3. **Fila**: O job é adicionado à fila BullMQ
4. **Worker**: Processa o job e faz o crawling
5. **Parser**: Extrai título, descrição, conteúdo e links
6. **Screenshot**: Captura screenshot da página
7. **Indexação**: Indexa no Typesense
8. **Armazenamento**: Salva no PostgreSQL

## 🔒 Segurança

- Validação de entrada com Joi/Zod
- Sanitização de HTML
- Rate limiting (recomendado em produção)
- CORS configurado

## 📈 Performance

- Indexação assíncrona
- Fila de processamento com BullMQ
- Busca rápida com Typesense
- Cache de resultados (recomendado)

## 🧪 Testes

```bash
# Execute os testes
npm test

# Execute com coverage
npm run test:coverage
```

## 📝 Licença

MIT

## 👥 Contribuição

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request