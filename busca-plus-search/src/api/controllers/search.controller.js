const { validateSearch, validatePageId, validateSuggestion } = require('../validators/search.validator');
const { errorTypes } = require('../../utils/errors');
const {
  RESULTS_PER_PAGE,
  SEARCH_TABS,
  SearchService,
  buildIndexViewModel,
} = require('../../modules/search');

class SearchController {
  constructor({ searchService = new SearchService() } = {}) {
    this.searchService = searchService;

    this.index = this.index.bind(this);
    this.search = this.search.bind(this);
    this.getPage = this.getPage.bind(this);
    this.suggestions = this.suggestions.bind(this);
    this.searchImages = this.searchImages.bind(this);
  }

  async index(req, res, next) {
    try {
      const searchData = validateSearch(req.query);
      const tab = req.query.tab || SEARCH_TABS.ALL;

      if (!searchData) {
        return res.render('index', buildIndexViewModel({ tab }));
      }

      const { query, page, sourceId } = searchData;

      if (tab === SEARCH_TABS.IMAGES) {
        const results = await this.searchService.searchImages(query, page, sourceId);

        return res.render('index', buildIndexViewModel({
          page,
          query,
          results,
          sourceId,
          tab,
        }));
      }

      const results = await this.searchService.search(query, page, sourceId);

      return res.render('index', buildIndexViewModel({
        page,
        query,
        results,
        sourceId,
        tab,
      }));
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
      const page = await this.searchService.getPageById(id);

      if (!page) {
        throw errorTypes.NOT_FOUND('Pagina');
      }

      return res.render('page', { page });
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
}

const searchController = new SearchController();

module.exports = searchController;
module.exports.SearchController = SearchController;
module.exports.RESULTS_PER_PAGE = RESULTS_PER_PAGE;
