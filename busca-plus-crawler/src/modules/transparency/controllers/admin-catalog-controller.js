const { CatalogSource, CatalogRun, CatalogDocument } = require('../../../models');
const { CatalogService } = require('../services/catalog-service');

class AdminCatalogController {
  static async index(req, res, next) {
    try {
      await CatalogRun.update(
        {
          status: 'cancelled',
          finished_at: new Date(),
          message: 'Execução abandonada (timeout)',
        },
        {
          where: {
            status: 'running',
            started_at: {
              [require('sequelize').Op.lt]: new Date(Date.now() - 30 * 60 * 1000),
            },
          },
        }
      );

      const sources = await CatalogSource.findAll({
        order: [['created_at', 'DESC']],
      });

      const runs = await CatalogRun.findAll({
        limit: 20,
        order: [['started_at', 'DESC']],
      });

      return res.render('admin/layout', {
        title: 'Catálogo de Documentos',
        currentPage: 'catalog',
        partial: 'catalog/index',
        data: null,
        stats: null,
        pagination: null,
        sources,
        runs,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createSource(req, res, next) {
    try {
      await CatalogSource.create({
        name: req.body.name,
        slug: req.body.slug,
        source_url: req.body.source_url,
        is_active: req.body.is_active === 'on',
        auto_update_enabled: req.body.auto_update_enabled === 'on',
        auto_index_after_catalog: req.body.auto_index_after_catalog === 'on',
        schedule_type: req.body.schedule_type || 'manual',
        last_status: 'idle',
      });

      return res.redirect('/admin/catalog');
    } catch (error) {
      next(error);
    }
  }

  static async runCatalog(req, res, next) {
    try {
      const existingRun = await CatalogRun.findOne({
        where: {
          source_id: req.params.id,
          status: 'running',
        },
      });

      if (existingRun) {
        await existingRun.update({
          status: 'cancelled',
          finished_at: new Date(),
          message: 'Cancelado pelo usuário (nova execução iniciada)',
        });
      }

      setImmediate(async () => {
        const service = new CatalogService({ logger: req.app.locals.logger });
        try {
          await service.runCreateOrUpdate(req.params.id, {
            type: req.body.type || 'update',
            maxPages: parseInt(req.body.max_pages) || null,
          });
        } catch (err) {
          req.app.locals.logger.error(`[catalog] Erro na execução: ${err.message}`);
        }
      });

      return res.redirect('/admin/catalog?msg=run_started');
    } catch (error) {
      next(error);
    }
  }

  static async showDocuments(req, res, next) {
    try {
      const source = await CatalogSource.findByPk(req.params.id);
      if (!source) throw new Error('Fonte não encontrada');

      const documents = await CatalogDocument.findAll({
        where: { source_id: source.id },
        limit: 100,
        order: [['created_at', 'DESC']],
      });

      return res.render('admin/layout', {
        title: `Documentos - ${source.name}`,
        currentPage: 'catalog',
        partial: 'catalog/documents',
        data: null,
        stats: null,
        pagination: null,
        source,
        documents,
      });
    } catch (error) {
      next(error);
    }
  }

  static async clearQueue(req, res, next) {
    try {
      await CatalogRun.update(
        {
          status: 'cancelled',
          finished_at: new Date(),
          message: 'Cancelado pelo usuário via botão Limpar Fila',
        },
        {
          where: {
            status: 'running',
          },
        }
      );

      return res.redirect('/admin/catalog?msg=queue_cleared');
    } catch (error) {
      next(error);
    }
  }

  static async resetAll(req, res, next) {
    try {
      const { Op } = require('sequelize');

      await CatalogDocument.destroy({ where: {} });
      await CatalogRun.destroy({ where: {} });
      await CatalogSource.update(
        {
          last_status: 'idle',
          total_documents: 0,
          last_run_at: null,
        },
        {
          where: {},
        }
      );

      return res.redirect('/admin/catalog?msg=reset_done');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { AdminCatalogController };