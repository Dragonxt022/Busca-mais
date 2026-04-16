const pageService = require('../../services/page.service');
const { validatePage, validatePagination } = require('../validators/source.validator');
const { errorTypes } = require('../../utils/errors');
const { Op } = require('sequelize');

class PageController {
  async list(req, res, next) {
    try {
      const { page, limit, offset } = validatePagination(req.query);
      const { sourceId, status, search } = req.query;

      const result = await pageService.list({ page, limit, offset, sourceId, status, search });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const page = await pageService.getById(req.params.id);
      if (!page) {
        throw errorTypes.NOT_FOUND('Página');
      }
      res.json(page);
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const data = validatePage(req.body);
      const page = await pageService.create(data);
      res.status(201).json(page);
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const existingPage = await pageService.getById(req.params.id);
      if (!existingPage) {
        throw errorTypes.NOT_FOUND('Página');
      }

      const page = await pageService.update(req.params.id, req.body);
      res.json(page);
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const existingPage = await pageService.getById(req.params.id);
      if (!existingPage) {
        throw errorTypes.NOT_FOUND('Página');
      }

      await pageService.delete(req.params.id);
      res.json({ message: 'Página deletada com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async queueForCrawl(req, res, next) {
    try {
      const existingPage = await pageService.getById(req.params.id);
      if (!existingPage) {
        throw errorTypes.NOT_FOUND('Página');
      }

      const page = await pageService.queueForCrawl(req.params.id);
      res.json(page);
    } catch (error) {
      next(error);
    }
  }

  async reindex(req, res, next) {
    try {
      const existingPage = await pageService.getById(req.params.id);
      if (!existingPage) {
        throw errorTypes.NOT_FOUND('Página');
      }

      const result = await pageService.reindex(req.params.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async bulkCreate(req, res, next) {
    try {
      const { urls, sourceId } = req.body;
      
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        throw errorTypes.VALIDATION('urls deve ser um array não vazio');
      }

      const result = await pageService.bulkCreateFromUrls(urls, sourceId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req, res, next) {
    try {
      const { sourceId } = req.query;
      const stats = await pageService.getStats(sourceId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PageController();
