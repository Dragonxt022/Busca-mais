const { fn, col, Op } = require('sequelize');
const { CatalogSource, CatalogRun, CatalogDocument, Page } = require('../../../models');
const { CatalogService } = require('../services/catalog-service');
const catalogIndexService = require('../services/catalog-index.service');

class AdminCatalogController {
  static buildStatusCountMap(items = []) {
    return items.reduce((acc, item) => {
      const sourceId = item.source_id || 'global';
      const status = item.status || 'pending';
      const count = Number(item.count || 0);

      if (!acc[sourceId]) {
        acc[sourceId] = { indexed: 0, pending: 0, error: 0 };
      }

      acc[sourceId][status] = count;
      return acc;
    }, {});
  }

  static buildProgress(statusCounts = {}, totalDocuments = 0) {
    const indexed = Number(statusCounts.indexed || 0);
    const pending = Number(statusCounts.pending || 0);
    const error = Number(statusCounts.error || 0);
    const total = totalDocuments || indexed + pending + error;
    const processed = indexed + error;
    const progressPercent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

    return {
      error,
      indexed,
      pending,
      processed,
      progressPercent,
      resumable: pending + error > 0,
      total,
    };
  }

  static async index(req, res, next) {
    try {
      await CatalogRun.update(
        {
          status: 'cancelled',
          finished_at: new Date(),
          message: 'Execucao abandonada (timeout)',
        },
        {
          where: {
            status: 'running',
            started_at: {
              [Op.lt]: new Date(Date.now() - 30 * 60 * 1000),
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

      const documentStats = await CatalogDocument.findAll({
        attributes: [
          'status',
          [fn('COUNT', col('id')), 'count'],
        ],
        group: ['status'],
        raw: true,
      });

      const sourceDocumentStats = await CatalogDocument.findAll({
        attributes: [
          'source_id',
          'status',
          [fn('COUNT', col('id')), 'count'],
        ],
        group: ['source_id', 'status'],
        raw: true,
      });

      const sourceStatsMap = AdminCatalogController.buildStatusCountMap(sourceDocumentStats);
      const sourcesWithProgress = sources.map((source) => {
        const plainSource = source.get({ plain: true });
        const progress = AdminCatalogController.buildProgress(
          sourceStatsMap[source.id],
          plainSource.total_documents || 0
        );

        return {
          ...plainSource,
          progress,
        };
      });

      return res.render('admin/layout', {
        title: 'Catalogo de Documentos',
        currentPage: 'catalog',
        partial: 'catalog/index',
        data: null,
        stats: null,
        pagination: null,
        documentStats,
        msg: req.query.msg,
        runs,
        sources: sourcesWithProgress,
      });
    } catch (error) {
      return next(error);
    }
  }

  static async createSource(req, res, next) {
    try {
      const slug = req.body.slug || (req.body.name ? req.body.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null);
      const VALID_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
      const uf = String(req.body.state || '').toUpperCase().trim();
      await CatalogSource.create({
        name: req.body.name,
        slug,
        source_url: req.body.source_url,
        state: VALID_UF.includes(uf) ? uf : null,
        city: req.body.city ? String(req.body.city).trim() : null,
        is_active: req.body.is_active === 'on',
        auto_update_enabled: req.body.auto_update_enabled === 'on',
        auto_index_after_catalog: req.body.auto_index_after_catalog === 'on',
        schedule_type: req.body.schedule_type || 'manual',
        last_status: 'idle',
      });

      return res.redirect('/admin/catalog');
    } catch (error) {
      return next(error);
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
          message: 'Cancelado pelo usuario (nova execucao iniciada)',
        });
      }

      setImmediate(async () => {
        const service = new CatalogService({ logger: req.app.locals.logger });
        try {
          await service.runCreateOrUpdate(req.params.id, {
            type: req.body.type || 'update',
            maxPages: parseInt(req.body.max_pages, 10) || null,
          });
        } catch (err) {
          req.app.locals.logger.error(`[catalog] Erro na execucao: ${err.message}`);
        }
      });

      return res.redirect('/admin/catalog?msg=run_started');
    } catch (error) {
      return next(error);
    }
  }

  static async queueIndex(req, res, next) {
    try {
      const body = req.body || {};
      const onlyPending = body.only_pending === 'on';

      await catalogIndexService.queueSourceDocuments(req.params.id, {
        onlyPending,
        resetErrored: true,
      });

      return res.redirect(`/admin/catalog?msg=${onlyPending ? 'resume_started' : 'index_started'}`);
    } catch (error) {
      return next(error);
    }
  }

  static async showDocuments(req, res, next) {
    try {
      const source = await CatalogSource.findByPk(req.params.id);
      if (!source) {
        throw new Error('Fonte nao encontrada');
      }

      const documents = await CatalogDocument.findAll({
        where: { source_id: source.id },
        limit: 100,
        order: [['created_at', 'DESC']],
      });

      const documentStats = await CatalogDocument.findAll({
        where: { source_id: source.id },
        attributes: [
          'status',
          [fn('COUNT', col('id')), 'count'],
        ],
        group: ['status'],
        raw: true,
      });

      const progress = AdminCatalogController.buildProgress(
        AdminCatalogController.buildStatusCountMap(
          documentStats.map((item) => ({ ...item, source_id: source.id }))
        )[source.id],
        source.total_documents || documents.length
      );

      return res.render('admin/layout', {
        title: `Documentos - ${source.name}`,
        currentPage: 'catalog',
        partial: 'catalog/documents',
        data: null,
        stats: null,
        pagination: null,
        source,
        documents,
        documentStats,
        progress,
        msg: req.query.msg,
      });
    } catch (error) {
      return next(error);
    }
  }

  static async clearQueue(req, res, next) {
    try {
      await CatalogRun.update(
        {
          status: 'cancelled',
          finished_at: new Date(),
          message: 'Cancelado pelo usuario via botao Limpar Fila',
        },
        {
          where: {
            status: 'running',
          },
        }
      );

      return res.redirect('/admin/catalog?msg=queue_cleared');
    } catch (error) {
      return next(error);
    }
  }

  static async resetAll(req, res, next) {
    try {
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
      return next(error);
    }
  }

  static async deleteSource(req, res, next) {
    try {
      const { id } = req.params;
      
      const source = await CatalogSource.findByPk(id);
      if (!source) {
        return res.status(404).json({ error: 'Fonte nao encontrada' });
      }

      const cascade = req.query.cascade === 'true';
      
      if (cascade) {
        await CatalogDocument.destroy({ where: { source_id: id } });
        await CatalogRun.destroy({ where: { source_id: id } });
      } else {
        const docCount = await CatalogDocument.count({ where: { source_id: id } });
        if (docCount > 0) {
          return res.status(400).json({ 
            error: `Esta fonte possui ${docCount} documentos. Use ?cascade=true para excluir tudo ou remova os documentos primeiro.` 
          });
        }
        
        const runCount = await CatalogRun.count({ where: { source_id: id } });
        if (runCount > 0) {
          await CatalogRun.destroy({ where: { source_id: id } });
        }
      }

      await source.destroy();

      return res.json({ message: 'Fonte excluida com sucesso', deleted: true });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = { AdminCatalogController };
