const { fn, col, Op } = require('sequelize');
const { CatalogSource, CatalogRun, CatalogDocument, Page } = require('../../../models');
const { CatalogService } = require('../services/catalog-service');
const catalogIndexService = require('../services/catalog-index.service');
const { parseBoolean, parseCsv, serializeCsv } = require('../../../utils/csv');

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
        max_documents: req.body.max_documents ? parseInt(req.body.max_documents, 10) || null : null,
        last_status: 'idle',
      });

      return res.redirect('/admin/catalog');
    } catch (error) {
      return next(error);
    }
  }

  static async updateSource(req, res, next) {
    try {
      const source = await CatalogSource.findByPk(req.params.id);
      if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });

      const VALID_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
      const uf = String(req.body.state || '').toUpperCase().trim();

      await source.update({
        name: req.body.name || source.name,
        source_url: req.body.source_url || source.source_url,
        state: VALID_UF.includes(uf) ? uf : null,
        city: req.body.city ? String(req.body.city).trim() : null,
        is_active: req.body.is_active === 'on' || req.body.is_active === 'true' || req.body.is_active === true,
        auto_update_enabled: req.body.auto_update_enabled === 'on' || req.body.auto_update_enabled === 'true',
        auto_index_after_catalog: req.body.auto_index_after_catalog === 'on' || req.body.auto_index_after_catalog === 'true',
        schedule_type: req.body.schedule_type || source.schedule_type,
        max_documents: req.body.max_documents !== undefined
          ? (req.body.max_documents ? parseInt(req.body.max_documents, 10) || null : null)
          : source.max_documents,
      });

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  }

  static async exportSourcesCsv(req, res, next) {
    try {
      const mode = req.query.mode || 'sources';

      if (mode === 'documents' || mode === 'full') {
        const documents = await CatalogDocument.findAll({
          include: [{ model: CatalogSource, as: 'source', attributes: ['name'] }],
          order: [['created_at', 'DESC']],
        });

        const columns = [
          { key: 'id', getter: (row) => row.id },
          { key: 'source_id', getter: (row) => row.source_id },
          { key: 'source_name', getter: (row) => (row.source && row.source.name) || '' },
          { key: 'external_id', getter: (row) => row.external_id || '' },
          { key: 'tipo', getter: (row) => row.tipo || '' },
          { key: 'numero_ano', getter: (row) => row.numero_ano || '' },
          { key: 'descricao', getter: (row) => row.descricao || '' },
          { key: 'ementa', getter: (row) => row.ementa || '' },
          { key: 'data_documento', getter: (row) => row.data_documento || '' },
          { key: 'data_publicacao', getter: (row) => row.data_publicacao || '' },
          { key: 'download_url', getter: (row) => row.download_url || '' },
          { key: 'detalhe_url', getter: (row) => row.detalhe_url || '' },
          { key: 'extension', getter: (row) => row.extension || '' },
          { key: 'status', getter: (row) => row.status || '' },
        ];

        if (mode === 'full') {
          columns.push({
            key: 'extracted_text',
            getter: (row) => {
              const meta = row.metadata_json || {};
              return meta.extracted_text || '';
            },
          });
        }

        const rows = documents.map((d) => d.get({ plain: true }));
        const csv = serializeCsv(rows, columns);
        const filename = mode === 'full' ? 'catalog-documentos-completo.csv' : 'catalog-documentos.csv';

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(`\uFEFF${csv}`);
      }

      const sources = await CatalogSource.findAll({ order: [['created_at', 'DESC']] });
      const csv = serializeCsv(sources, [
        { key: 'id', getter: (row) => row.id },
        { key: 'name', getter: (row) => row.name },
        { key: 'slug', getter: (row) => row.slug },
        { key: 'source_url', getter: (row) => row.source_url },
        { key: 'state', getter: (row) => row.state || '' },
        { key: 'city', getter: (row) => row.city || '' },
        { key: 'is_active', getter: (row) => row.is_active },
        { key: 'auto_update_enabled', getter: (row) => row.auto_update_enabled },
        { key: 'auto_index_after_catalog', getter: (row) => row.auto_index_after_catalog },
        { key: 'schedule_type', getter: (row) => row.schedule_type || 'manual' },
        { key: 'max_documents', getter: (row) => row.max_documents ?? '' },
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="catalog-fontes.csv"');
      return res.send(`\uFEFF${csv}`);
    } catch (error) {
      return next(error);
    }
  }

  static async importDocumentsCsv(req, res, next) {
    try {
      const rows = parseCsv(req.body.csv_text || '');
      if (rows.length === 0) {
        return res.status(400).json({ error: 'CSV vazio ou invalido' });
      }

      let created = 0;
      let updated = 0;

      for (const row of rows) {
        if (!row.source_id || !row.external_id) continue;

        const payload = {
          source_id: row.source_id,
          external_id: row.external_id,
          tipo: row.tipo || null,
          numero_ano: row.numero_ano || null,
          descricao: row.descricao || null,
          ementa: row.ementa || null,
          data_documento: row.data_documento || null,
          data_publicacao: row.data_publicacao || null,
          download_url: row.download_url || null,
          detalhe_url: row.detalhe_url || null,
          extension: row.extension || null,
          status: ['indexed', 'pending', 'error'].includes(row.status) ? row.status : 'pending',
        };

        const existing = row.id
          ? await CatalogDocument.findByPk(row.id)
          : await CatalogDocument.findOne({ where: { source_id: payload.source_id, external_id: payload.external_id } });

        if (row.extracted_text) {
          const existingMeta = (existing && existing.metadata_json) ? existing.metadata_json : {};
          payload.metadata_json = { ...existingMeta, extracted_text: row.extracted_text };
          if (payload.status === 'pending') payload.status = 'indexed';
        }

        if (existing) {
          await existing.update(payload);
          updated += 1;
        } else {
          await CatalogDocument.create(payload);
          created += 1;
        }
      }

      return res.json({ created, updated, total: created + updated });
    } catch (error) {
      return next(error);
    }
  }

  static async importSourcesCsv(req, res, next) {
    try {
      const rows = parseCsv(req.body.csv_text || '');
      if (rows.length === 0) {
        return res.status(400).json({ error: 'CSV vazio ou invalido' });
      }

      const VALID_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
      const VALID_SCHEDULE = ['manual', 'hourly', 'daily', 'weekly'];
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const slug = row.slug || (row.name
          ? row.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : null);
        const state = String(row.state || '').toUpperCase().trim();
        const payload = {
          name: row.name,
          slug,
          source_url: row.source_url,
          state: VALID_UF.includes(state) ? state : null,
          city: row.city ? String(row.city).trim() : null,
          is_active: parseBoolean(row.is_active, true),
          auto_update_enabled: parseBoolean(row.auto_update_enabled, false),
          auto_index_after_catalog: parseBoolean(row.auto_index_after_catalog, false),
          schedule_type: VALID_SCHEDULE.includes(String(row.schedule_type || '').trim()) ? String(row.schedule_type).trim() : 'manual',
          max_documents: row.max_documents ? parseInt(row.max_documents, 10) || null : null,
          last_status: 'idle',
        };

        if (!payload.name || !payload.slug || !payload.source_url) {
          continue;
        }

        const existing = row.id
          ? await CatalogSource.findByPk(row.id)
          : await CatalogSource.findOne({ where: { [Op.or]: [{ slug: payload.slug }, { source_url: payload.source_url }] } });

        if (existing) {
          await existing.update(payload);
          updated += 1;
        } else {
          await CatalogSource.create(payload);
          created += 1;
        }
      }

      return res.json({ created, updated, total: created + updated });
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
          const catalogSource = await CatalogSource.findByPk(req.params.id);
          const maxPages = parseInt(req.body.max_pages, 10) || catalogSource?.max_documents || null;
          await service.runCreateOrUpdate(req.params.id, {
            type: req.body.type || 'update',
            maxPages,
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
