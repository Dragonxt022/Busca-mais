const sourceService = require('../../services/source.service');
const { validateSource, validatePagination } = require('../validators/source.validator');
const { errorTypes } = require('../../utils/errors');
const { Op } = require('sequelize');

class SourceController {
  async list(req, res, next) {
    try {
      const { page, limit, offset } = validatePagination(req.query);
      const { status, category, search } = req.query;

      const where = {};
      
      if (status === 'active') {
        where.is_active = true;
      } else if (status === 'inactive') {
        where.is_active = false;
      }

      if (category) {
        where.category = category;
      }

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { base_url: { [Op.like]: `%${search}%` } },
        ];
      }

      const result = await sourceService.list({ page, limit, offset, where });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const source = await sourceService.getById(req.params.id);
      if (!source) {
        throw errorTypes.NOT_FOUND('Fonte');
      }
      res.json(source);
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const data = validateSource(req.body);
      const source = await sourceService.create(data);
      res.status(201).json(source);
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const existingSource = await sourceService.getById(req.params.id);
      if (!existingSource) {
        throw errorTypes.NOT_FOUND('Fonte');
      }

      const data = validateSource({ ...existingSource.toJSON(), ...req.body });
      const source = await sourceService.update(req.params.id, data);
      res.json(source);
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const existingSource = await sourceService.getById(req.params.id);
      if (!existingSource) {
        throw errorTypes.NOT_FOUND('Fonte');
      }

      await sourceService.delete(req.params.id);
      res.json({ message: 'Fonte deletada com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async startCrawl(req, res, next) {
    try {
      const existingSource = await sourceService.getById(req.params.id);
      if (!existingSource) {
        throw errorTypes.NOT_FOUND('Fonte');
      }

      const job = await sourceService.startCrawl(req.params.id, req.body);
      res.json(job);
    } catch (error) {
      next(error);
    }
  }

  async getCrawlStatus(req, res, next) {
    try {
      const existingSource = await sourceService.getById(req.params.id);
      if (!existingSource) {
        throw errorTypes.NOT_FOUND('Fonte');
      }

      const jobs = await sourceService.getCrawlStatus(req.params.id);
      res.json(jobs);
    } catch (error) {
      next(error);
    }
  }

  async getStats(req, res, next) {
    try {
      const existingSource = await sourceService.getById(req.params.id);
      if (!existingSource) {
        throw errorTypes.NOT_FOUND('Fonte');
      }

      const stats = await sourceService.getStats(req.params.id);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SourceController();
