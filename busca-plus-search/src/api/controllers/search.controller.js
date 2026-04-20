const axios = require('axios');

const { validateSearch, validatePageId, validateSuggestion } = require('../validators/search.validator');
const { errorTypes } = require('../../utils/errors');
const {
  RESULTS_PER_PAGE,
  SEARCH_TABS,
  SearchService,
  buildIndexViewModel,
  buildPageViewModel,
} = require('../../modules/search');
const AiSummaryService = require('../../modules/ai/ai-summary.service');
const config = require('../../config');

let _aiCache = null;
let _aiCacheTime = 0;
const AI_CACHE_TTL = 5 * 60 * 1000;

async function getAiFeatures() {
  const now = Date.now();
  if (_aiCache && now - _aiCacheTime < AI_CACHE_TTL) return _aiCache;
  try {
    const { data } = await axios.get(`${config.crawler.apiUrl}/api/public/ai-settings`, { timeout: 2000 });
    _aiCache = data;
    _aiCacheTime = now;
    return data;
  } catch {
    return { enabled: false, features: { pageSummary: false, searchReport: false } };
  }
}

class SearchController {
  constructor({
    searchService = new SearchService(),
    aiSummaryService = new AiSummaryService(),
    aiFeaturesLoader = getAiFeatures,
  } = {}) {
    this.searchService = searchService;
    this.aiSummaryService = aiSummaryService;
    this.aiFeaturesLoader = aiFeaturesLoader;

    this.index = this.index.bind(this);
    this.search = this.search.bind(this);
    this.getPage = this.getPage.bind(this);
    this.suggestions = this.suggestions.bind(this);
    this.searchImages = this.searchImages.bind(this);
    this.summarizePage = this.summarizePage.bind(this);
    this.generateSearchReport = this.generateSearchReport.bind(this);
  }

  async index(req, res, next) {
    try {
      const searchData = validateSearch(req.query);
      const tab = req.query.tab || SEARCH_TABS.ALL;
      const state = req.query.state || null;
      const city = req.query.city || null;
      const aiFeatures = await this.aiFeaturesLoader();

      if (!searchData) {
        return res.render('index', { ...buildIndexViewModel({ tab }), aiFeatures, state, city });
      }

      const { query, page, sourceId } = searchData;

      if (tab === SEARCH_TABS.IMAGES) {
        const results = await this.searchService.searchImages(query, page, sourceId, state, city);

        return res.render('index', {
          ...buildIndexViewModel({ page, query, results, sourceId, tab }),
          aiFeatures,
          state,
          city,
          sponsors: [],
        });
      }

      const [results, sponsors] = await Promise.all([
        this.searchService.search(query, page, sourceId, state, city),
        this.searchService.getActiveSponsors(state, city),
      ]);

      return res.render('index', {
        ...buildIndexViewModel({ page, query, results, sourceId, tab, sponsors, state, city }),
        aiFeatures,
        state,
        city,
      });
    } catch (error) {
      return next(error);
    }
  }

  async search(req, res, next) {
    try {
      const searchData = validateSearch(req.query);

      if (!searchData) {
        return res.json({
          hits: [],
          found: 0,
          page: 1,
        });
      }

      const { query, page, sourceId } = searchData;
      const results = await this.searchService.search(query, page, sourceId);

      return res.json(results);
    } catch (error) {
      return next(error);
    }
  }

  async getPage(req, res, next) {
    try {
      const id = validatePageId(req.params.id);
      const query = req.query.q || '';
      const focus = req.query.focus || '';
      const [page, aiFeatures] = await Promise.all([
        this.searchService.getPageById(id),
        this.aiFeaturesLoader(),
      ]);

      if (!page) {
        throw errorTypes.NOT_FOUND('Pagina');
      }

      return res.render('page', buildPageViewModel({ page, query, focus, aiFeatures }));
    } catch (error) {
      return next(error);
    }
  }

  async suggestions(req, res, next) {
    try {
      const query = validateSuggestion(req.query.q);

      if (!query) {
        return res.json([]);
      }

      const suggestions = await this.searchService.getSuggestions(query);

      return res.json(suggestions);
    } catch (error) {
      return next(error);
    }
  }

  async searchImages(req, res, next) {
    try {
      const searchData = validateSearch(req.query);

      if (!searchData) {
        return res.json({
          hits: [],
          found: 0,
          page: 1,
        });
      }

      const { query, page, sourceId } = searchData;
      const results = await this.searchService.searchImages(query, page, sourceId);

      return res.json(results);
    } catch (error) {
      return next(error);
    }
  }

  async summarizePage(req, res, next) {
    try {
      const id = validatePageId(req.params.id);
      const query = req.body?.query || req.query?.q || '';
      const aiFeatures = await this.aiFeaturesLoader();

      if (!aiFeatures.enabled || !aiFeatures.features?.pageSummary) {
        throw errorTypes.VALIDATION('Resumo por IA desativado nas configuracoes.');
      }

      const page = await this.searchService.getPageById(id);

      if (!page) {
        throw errorTypes.NOT_FOUND('Pagina');
      }

      const result = await this.aiSummaryService.summarizeDocument(page, {
        query,
        feature: 'pageSummary',
      });

      return res.json({
        ...result,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  }

  async generateSearchReport(req, res, next) {
    try {
      const searchData = validateSearch(req.query);
      const aiFeatures = await this.aiFeaturesLoader();

      if (!aiFeatures.enabled || !aiFeatures.features?.searchReport) {
        throw errorTypes.VALIDATION('Relatorio por IA desativado nas configuracoes.');
      }

      if (!searchData) {
        throw errorTypes.VALIDATION('Query invalida para geracao de relatorio');
      }

      const { query, page, sourceId } = searchData;
      const results = await this.searchService.search(query, page, sourceId);

      if (!results.hits || results.hits.length === 0) {
        throw errorTypes.NOT_FOUND('Nenhum resultado encontrado para gerar relatorio');
      }

      const document = {
        title: `Busca: "${query}"`,
        content: results.hits.slice(0, 5).map((hit, index) => {
          const title = hit.title || 'Sem titulo';
          const description = hit.description || hit.summary || hit.content || 'Sem descricao';
          return `${index + 1}. ${title} - ${String(description).substring(0, 300)}`;
        }).join('\n\n'),
        sourceName: `${results.found} resultados encontrados`,
      };

      const report = await this.aiSummaryService.summarizeDocument(document, {
        query,
        feature: 'searchReport',
      });

      return res.json({
        ...report,
        query,
        totalResults: results.found,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  }
}

const searchController = new SearchController();

module.exports = searchController;
module.exports.SearchController = SearchController;
module.exports.RESULTS_PER_PAGE = RESULTS_PER_PAGE;
