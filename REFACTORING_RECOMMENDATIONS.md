# 📋 Recomendações de Refatoração - Busca Plus

Este documento apresenta as melhores sugestões de refatoração do código, organizando a arquitetura seguindo o padrão MVC adaptado para aplicações Node.js modernas.

## 🎯 Estrutura Proposta

```
src/
├── handlers/          # Controllers que recebem requisições HTTP
├── services/          # Regras de negócio da aplicação
├── repositories/      # Acesso a dados (banco, Typesense, APIs externas)
├── templates/         # Views (EJS, HTML)
├── models/            # Structs do domínio (definições de entidades)
├── middlewares/       # Middlewares de autenticação, validação, etc.
├── libs/              # Bibliotecas e utilitários genéricos
├── config/            # Configurações da aplicação
└── utils/             # Funções utilitárias puras
```

---

## 📁 BUSCA-PLUS-CRAWLER

### 1. Separação de Handlers e Services

**Problema atual:** `crawl.worker.js` acumula responsabilidades de orquestração de filas, processamento de crawling, indexação e atualização de modelos.

**Solução proposta:**

```
src/
├── handlers/
│   └── crawl.handler.js        # Orquestra as filas e dispatch
├── services/
│   ├── crawl.service.js        # Regra de negócio do crawling
│   ├── index.service.js        # Regra de negócio de indexação
│   ├── discover.service.js     # Regra de negócio de descoberta de links
│   └── page.service.js         # Regra de negócio de páginas
├── repositories/
│   ├── page.repository.js      # Acesso ao modelo Page
│   ├── source.repository.js    # Acesso ao modelo Source
│   └── crawl-job.repository.js # Acesso ao modelo CrawlJob
├── models/
│   ├── page.model.js           # (já existe, mover para cá)
│   ├── source.model.js         # (já existe, mover para cá)
│   └── crawl-job.model.js      # (já existe, mover para cá)
└── libs/
    └── crawler.js              # (permanece, é biblioteca de infra)
```

**Exemplo de refatoração do `crawl.worker.js`:**

```javascript
// src/handlers/crawl.handler.js
const { Worker } = require('bullmq');
const { crawlService, indexService, discoverService } = require('../services');

class CrawlHandler {
  constructor() {
    this.workers = {};
  }

  async start() {
    await this.startCrawlWorker();
    await this.startIndexWorker();
    await this.startDiscoverWorker();
  }

  async startCrawlWorker() {
    this.workers.crawl = new Worker(QUEUE_NAMES.CRAWL, async (job) => {
      const { pageId, url, sourceId, crawlJobId } = job.data;
      return await crawlService.processCrawl({ pageId, url, sourceId, crawlJobId });
    }, { connection: redisConfig, concurrency: 2 });
  }

  // ... handlers para index e discover
}
```

```javascript
// src/services/crawl.service.js
const Crawler = require('../libs/crawler');
const pageRepository = require('../repositories/page.repository');
const crawlJobRepository = require('../repositories/crawl-job.repository');
const { indexQueue } = require('../libs/queue');

class CrawlService {
  constructor() {
    this.crawler = new Crawler();
  }

  async processCrawl({ pageId, url, sourceId, crawlJobId }) {
    const source = await sourceRepository.findById(sourceId);
    const config = this.buildParserConfig(source);
    
    const result = await this.crawler.crawlPage(url, {
      extractLinks: false,
      downloadImages: await source?.shouldDownloadImages(),
      parserConfig: config,
    });

    if (!result.success) {
      await this.handleCrawlError({ pageId, crawlJobId, error: result.error });
      throw new Error(result.error);
    }

    await pageRepository.update(pageId, this.buildUpdateData(result));
    await this.updateCrawlJobProgress(crawlJobId, result);
    await indexQueue.add('index-page', { pageId });

    return result;
  }

  buildParserConfig(source) {
    return {
      contentSelector: source?.config_json?.contentSelector || '',
      excludeSelectors: Array.isArray(source?.config_json?.excludeSelectors)
        ? source.config_json.excludeSelectors
        : [],
    };
  }

  // ... métodos privados auxiliares
}

module.exports = new CrawlService();
```

```javascript
// src/repositories/page.repository.js
const Page = require('../models/page.model');

class PageRepository {
  async findById(id) {
    return Page.findByPk(id);
  }

  async update(id, data) {
    const [affected] = await Page.update(data, { where: { id } });
    return affected > 0;
  }

  async findOrCreate({ hashUrl, defaults }) {
    return Page.findOrCreate({
      where: { hash_url: hashUrl },
      defaults,
    });
  }

  async markError(id, errorMessage) {
    return this.update(id, {
      has_error: true,
      error_message: errorMessage,
      last_crawled_at: new Date(),
    });
  }
}

module.exports = new PageRepository();
```

---

### 2. Models - Centralização das Definições

**Problema atual:** Models estão dispersos em `modules/*/` e imports via `src/models/index.js`.

**Solução proposta:**

```
src/models/
├── index.js                # Barrel export
├── page.model.js           # Mover de modules/pages/
├── source.model.js         # Mover de modules/sources/
├── crawl-job.model.js      # Mover de modules/crawl-jobs/
├── catalog-document.model.js
└── catalog-source.model.js
```

```javascript
// src/models/index.js
const Page = require('./page.model');
const Source = require('./source.model');
const CrawlJob = require('./crawl-job.model');
const CatalogDocument = require('./catalog-document.model');
const CatalogSource = require('./catalog-source.model');

// Definição de relacionamentos
Page.belongsTo(Source, { foreignKey: 'source_id', as: 'source' });
Source.hasMany(Page, { foreignKey: 'source_id' });

module.exports = {
  Page,
  Source,
  CrawlJob,
  CatalogDocument,
  CatalogSource,
};
```

---

### 3. Templates - Organização de Views

**Estrutura atual:** `src/views/admin/` com EJS.

**Solução proposta:**

```
src/templates/
├── layouts/
│   └── admin.layout.ejs
├── admin/
│   ├── dashboard.ejs
│   ├── login.ejs
│   └── catalog/
│       ├── index.ejs
│       └── edit.ejs
├── emails/
│   └── welcome.ejs
└── partials/
    ├── header.ejs
    ├── footer.ejs
    └── navigation.ejs
```

---

## 📁 BUSCA-PLUS-SEARCH

### 1. Handlers (Controllers) - Refatoração do SearchController

**Problema atual:** `search.controller.js` tem 259 linhas e mistura:
- Validação de entrada
- Chamadas a serviços
- Renderização de views
- Lógica de cache de AI features

**Solução proposta:**

```
src/
├── api/
│   ├── handlers/
│   │   └── search.handler.js     # Renomear de search.controller.js
│   ├── services/
│   │   ├── search.service.js     # (mover de modules/search/)
│   │   └── ai-summary.service.js # (mover de modules/ai/)
│   └── repositories/
│       └── search.repository.js  # Acesso ao Typesense
├── modules/
│   └── search/
│       ├── search.presenter.js   # (permanece, é view model)
│       ├── search.constants.js   # (permanece)
│       └── index.js              # Barrel export
└── services/
    └── sponsor.service.js        # Extraído do search.service.js
```

**Exemplo de refatoração:**

```javascript
// src/api/handlers/search.handler.js
const { validateSearch, validatePageId, validateSuggestion } = require('../validators/search.validator');
const { searchService, aiSummaryService } = require('../services');
const { sponsorService } = require('../services/sponsor.service');
const { RESULTS_PER_PAGE, SEARCH_TABS, buildIndexViewModel, buildPageViewModel } = require('../../modules/search');
const { errorTypes } = require('../../utils/errors');
const config = require('../../config');

class SearchHandler {
  constructor() {
    this.aiCache = null;
    this.aiCacheTime = 0;
    this.AI_CACHE_TTL = 5 * 60 * 1000;
  }

  async getAiFeatures() {
    const now = Date.now();
    if (this.aiCache && now - this.aiCacheTime < this.AI_CACHE_TTL) {
      return this.aiCache;
    }
    try {
      const { data } = await require('axios').get(
        `${config.crawler.apiUrl}/api/public/ai-settings`,
        { timeout: 2000 }
      );
      this.aiCache = data;
      this.aiCacheTime = now;
      return data;
    } catch {
      return { enabled: false, features: { pageSummary: false, searchReport: false } };
    }
  }

  async index(req, res, next) {
    try {
      const searchData = validateSearch(req.query);
      const tab = req.query.tab || SEARCH_TABS.ALL;
      const { state, city } = req.query;
      const aiFeatures = await this.getAiFeatures();
      const requestContext = this.extractRequestContext(req);

      if (!searchData) {
        return res.render('index', { ...buildIndexViewModel({ tab }), aiFeatures, state, city });
      }

      const { query, page, sourceId } = searchData;

      if (tab === SEARCH_TABS.IMAGES) {
        const results = await searchService.searchImages(query, page, sourceId, state, city, requestContext);
        return res.render('index', {
          ...buildIndexViewModel({ page, query, results, sourceId, tab }),
          aiFeatures,
          state, city,
          sponsors: [],
        });
      }

      const [results, sponsors] = await Promise.all([
        searchService.search(query, page, sourceId, state, city, requestContext),
        sponsorService.getActiveSponsors(state, city),
      ]);

      return res.render('index', {
        ...buildIndexViewModel({ page, query, results, sourceId, tab, sponsors, state, city }),
        aiFeatures,
        state, city,
      });
    } catch (error) {
      return next(error);
    }
  }

  extractRequestContext(req) {
    const headers = req.headers || {};
    return {
      authorization: headers.authorization || '',
      cookie: headers.cookie || '',
      ip: req.ip || '',
      userAgent: headers['user-agent'] || '',
    };
  }

  // ... outros handlers (search, getPage, suggestions, etc.)
}

module.exports = new SearchHandler();
```

---

### 2. Services - Separação de Responsabilidades

**Problema atual:** `search.service.js` tem 495 linhas e acumula:
- Lógica de busca no Typesense
- Geração de snippets e highlights
- Formatação de resultados
- Log de pesquisas
- Chamadas à API externa de sponsors

**Solução proposta:**

```javascript
// src/services/search.service.js
const { searchRepository } = require('../repositories/search.repository');
const { snippetService } = require('./snippet.service');

class SearchService {
  async search(query, page = 1, sourceId = null, state = null, city = null, context = {}) {
    const result = await searchRepository.search({
      query,
      page,
      perPage: 10,
      sourceId,
      state,
      city,
    });

    await this.logSearch(query, result.found, sourceId, 'web', { ...context, state, city });

    return {
      hits: result.hits.map((hit) => this.formatHit(hit, query)),
      found: result.found,
      page: result.page,
      perPage: result.per_page,
      facets: result.facet_counts || [],
    };
  }

  formatHit(hit, query = '') {
    const doc = hit.document;
    const textForSummary = this.getTextForSummary(doc);
    const summary = snippetService.generateSummary(textForSummary) || doc.summary || null;
    const snippet = snippetService.buildSnippet(textForSummary || doc.title || '', query);

    return {
      id: doc.id,
      url: doc.url,
      title: doc.title,
      description: doc.description,
      summary,
      sourceName: doc.source_name || null,
      // ... resto dos campos
      matchSnippetHtml: snippet.html,
      matchSnippetText: snippet.text,
      focusText: snippet.focusText,
    };
  }

  getTextForSummary(doc) {
    if (doc.record_type === 'catalog_document') {
      return doc.description || doc.ementa || doc.extracted_text;
    }
    return doc.description || doc.content || null;
  }

  async logSearch(query, resultsCount, sourceId, searchType, context) {
    // ... implementação
  }
}

module.exports = new SearchService();
```

```javascript
// src/services/snippet.service.js
class SnippetService {
  generateSummary(text, maxLength = 500) {
    if (!text || typeof text !== 'string') return null;

    const cleanText = this.cleanText(text);
    if (!cleanText) return null;

    const sentences = this.extractSentences(cleanText);
    
    if (sentences.length > 0) {
      const summary = this.buildSummaryFromSentences(sentences, maxLength);
      if (summary) return summary;
    }

    return this.truncateText(cleanText, maxLength);
  }

  cleanText(text) {
    return text
      .replace(/[#>*_`]/g, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/p[aá]gina inicial\s*\/\s*[^.]+/gi, ' ')
      .replace(/deixe um coment[aá]rio[\s\S]*$/i, ' ')
      .replace(/veja tamb[eé]m[\s\S]*$/i, ' ')
      .replace(/nenhum coment[aá]rio/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractSentences(text) {
    return text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 45 && s.length <= 280);
  }

  buildSummaryFromSentences(sentences, maxLength) {
    let summary = '';
    for (const sentence of sentences) {
      const nextValue = summary ? `${summary} ${sentence}` : sentence;
      if (nextValue.length > maxLength) break;
      summary = nextValue;
      if (summary.length >= Math.min(240, maxLength * 0.7)) break;
    }
    return summary || null;
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    const truncated = text.slice(0, maxLength);
    const lastPeriod = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
    
    if (lastPeriod > maxLength * 0.6) {
      return truncated.slice(0, lastPeriod + 1);
    }
    
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.slice(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  }

  buildSnippet(text, query, maxLength = 220) {
    const cleanText = this.stripHtml(text);
    if (!cleanText) return { html: null, text: null, focusText: null };

    const tokens = this.tokenizeQuery(query);
    if (tokens.length === 0) {
      const fallback = this.generateSummary(cleanText, maxLength);
      return {
        html: this.escapeHtml(fallback),
        text: fallback,
        focusText: fallback.slice(0, 140).trim(),
      };
    }

    // ... lógica de highlight
  }

  tokenizeQuery(query) {
    return Array.from(new Set(
      String(query || '')
        .toLowerCase()
        .split(/[^a-z0-9À-ÿ]+/i)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    ));
  }

  stripHtml(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#39;');
  }
}

module.exports = new SnippetService();
```

---

### 3. Repositories - Abstração do Typesense

```javascript
// src/repositories/search.repository.js
const { typesense, COLLECTION_NAME } = require('../config/typesense');
const { logger } = require('../libs/logger');

class SearchRepository {
  constructor() {
    this.collectionName = COLLECTION_NAME;
  }

  async search({ query, page, perPage, sourceId, state, city }) {
    try {
      const params = this.buildSearchParams({ query, page, perPage, sourceId, state, city });
      return await typesense.collections(this.collectionName)
        .documents()
        .search(params);
    } catch (error) {
      logger.error('Repository search error:', error);
      throw error;
    }
  }

  async findById(id) {
    try {
      return await typesense.collections(this.collectionName)
        .documents(id)
        .retrieve();
    } catch (error) {
      if (error.httpStatus === 404) return null;
      throw error;
    }
  }

  async getSuggestions(query) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents()
        .search({
          q: query,
          query_by: 'title, description',
          per_page: 5,
          num_typos: 1,
        });

      return result.hits.map((hit) => ({
        text: hit.document.title,
        type: 'title',
      }));
    } catch (error) {
      logger.error('Repository suggestions error:', error);
      return [];
    }
  }

  buildSearchParams({ query, page, perPage, sourceId, state, city }) {
    const params = {
      q: query,
      query_by: 'title, description, content, document_type, document_number, source_name, publication_date, url',
      page: parseInt(page, 10),
      per_page: perPage,
      highlight_full_fields: 'title, description, content, document_type, document_number, source_name',
      snippet_threshold: 30,
      num_typos: 2,
      drop_tokens_threshold: 10,
      sort_by: '_text_match:desc,crawled_at:desc',
    };

    const filters = [];
    if (sourceId) filters.push(`source_id:=${sourceId}`);
    if (state) filters.push(`source_state:=${state}`);
    if (city) filters.push(`source_city:=${city}`);
    if (filters.length) params.filter_by = filters.join(' && ');

    return params;
  }
}

module.exports = new SearchRepository();
```

---

## 📊 RESUMO DAS MUDANÇAS

### Busca-Plus-Crawler

| Arquivo Atual | Nova Localização | Tipo |
|--------------|------------------|------|
| `src/modules/pages/page.model.js` | `src/models/page.model.js` | Model |
| `src/modules/sources/source.model.js` | `src/models/source.model.js` | Model |
| `src/modules/crawl-jobs/crawl-job.model.js` | `src/models/crawl-job.model.js` | Model |
| `src/workers/crawl.worker.js` | `src/handlers/crawl.handler.js` | Handler |
| (novo) | `src/services/crawl.service.js` | Service |
| (novo) | `src/services/index.service.js` | Service |
| (novo) | `src/services/discover.service.js` | Service |
| (novo) | `src/repositories/page.repository.js` | Repository |
| `src/views/admin/*` | `src/templates/admin/*` | Template |

### Busca-Plus-Search

| Arquivo Atual | Nova Localização | Tipo |
|--------------|------------------|------|
| `src/api/controllers/search.controller.js` | `src/api/handlers/search.handler.js` | Handler |
| `src/modules/search/search.service.js` | `src/services/search.service.js` | Service |
| (novo) | `src/services/snippet.service.js` | Service |
| (novo) | `src/services/sponsor.service.js` | Service |
| (novo) | `src/repositories/search.repository.js` | Repository |
| `src/modules/search/search.presenter.js` | `src/api/presenters/search.presenter.js` | Presenter |
| `src/views/*` | `src/templates/*` | Template |

---

## ✅ BENEFÍCIOS DA REFACTORY

1. **Separação de Responsabilidades:** Cada camada tem uma única responsabilidade clara
2. **Testabilidade:** Services e repositories podem ser testados isoladamente
3. **Manutenibilidade:** Mudanças em uma camada não afetam as outras
4. **Reusabilidade:** Services podem ser chamados de diferentes handlers
5. **Legibilidade:** Arquivos menores e mais focados

---

## 🚀 ORDEM SUGERIDA DE IMPLEMENTAÇÃO

1. **Fase 1 - Models:** Centralizar todos os models em `src/models/`
2. **Fase 2 - Repositories:** Criar repositories para abstrair acesso a dados
3. **Fase 3 - Services:** Extrair regras de negócio dos handlers/workers
4. **Fase 4 - Handlers:** Renomear controllers e simplificar
5. **Fase 5 - Templates:** Reorganizar estrutura de views
6. **Fase 6 - Tests:** Adicionar testes unitários para services e repositories

---

## 📝 NOTAS ADICIONAIS

- Manter `src/libs/` para bibliotecas de infra (crawler, queue, redis, typesense)
- Manter `src/config/` para configurações
- Manter `src/utils/` para funções utilitárias puras
- Considerar adicionar TypeScript gradualmente após a refatoração
- Adicionar testes unitários para cada service criado
