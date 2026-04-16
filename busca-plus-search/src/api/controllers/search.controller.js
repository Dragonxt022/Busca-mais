const SearchService = require('../../services/search.service');
const { validateSearch, validatePageId, validateSuggestion } = require('../validators/search.validator');
const { errorTypes } = require('../../utils/errors');

class SearchController {
  async index(req, res, next) {
    try {
      const { query, page, sourceId } = validateSearch(req.query) || {};
      const tab = req.query.tab || 'all';

      if (!query) {
        return res.render('index', {
          query: '',
          results: null,
          imageResults: null,
          totalHits: 0,
          page: 1,
          totalPages: 0,
          source: null,
          tab,
        });
      }

      const searchService = new SearchService();

      if (tab === 'images') {
        // Image search
        const results = await searchService.searchImages(query, page, sourceId);
        
        res.render('index', {
          query,
          results: null,
          imageResults: results.hits,
          totalHits: results.found,
          page,
          totalPages: Math.ceil(results.found / 20),
          source: sourceId,
          tab,
        });
      } else {
        // Regular search
        const results = await searchService.search(query, page, sourceId);

        res.render('index', {
          query,
          results: results.hits,
          imageResults: null,
          totalHits: results.found,
          page,
          totalPages: Math.ceil(results.found / 10),
          source: sourceId,
          tab,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async search(req, res, next) {
    try {
      const { query, page, sourceId } = validateSearch(req.query) || {};

      if (!query) {
        return res.json({
          hits: [],
          found: 0,
          page: 1,
        });
      }

      const searchService = new SearchService();
      const results = await searchService.search(query, page, sourceId);

      res.json(results);
    } catch (error) {
      next(error);
    }
  }

  async getPage(req, res, next) {
    try {
      const id = validatePageId(req.params.id);
      const searchService = new SearchService();
      const page = await searchService.getPageById(id);

      if (!page) {
        throw errorTypes.NOT_FOUND('Página');
      }

      res.render('page', { page });
    } catch (error) {
      next(error);
    }
  }

  async suggestions(req, res, next) {
    try {
      const query = validateSuggestion(req.query.q);

      if (!query) {
        return res.json([]);
      }

      const searchService = new SearchService();
      const suggestions = await searchService.getSuggestions(query);

      res.json(suggestions);
    } catch (error) {
      next(error);
    }
  }

  async searchImages(req, res, next) {
    try {
      const { query, page, sourceId } = validateSearch(req.query) || {};

      if (!query) {
        return res.json({
          hits: [],
          found: 0,
          page: 1,
        });
      }

      const searchService = new SearchService();
      const results = await searchService.searchImages(query, page, sourceId);

      res.json(results);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SearchController();
