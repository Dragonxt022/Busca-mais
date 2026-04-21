const { fn, col, Op } = require('sequelize');
const { CatalogSource, CatalogRun, CatalogDocument, Page } = require('../../../models');
const { CatalogService } = require('../services/catalog-service');
const catalogIndexService = require('../services/catalog-index.service');
const indexer = require('../../../libs/indexer');
const { parseBoolean, parseCsv, serializeCsv } = require('../../../utils/csv');

class AdminCatalogController {
  static VALID_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

  static VALID_SCHEDULE = ['manual', 'hourly', 'daily', 'weekly'];

  static slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  static parseImportMode(req) {
    return req.body.import_mode === 'replace' || req.body.replace_existing === true || req.body.replace_existing === 'true'
      ? 'replace'
      : 'merge';
  }

  static shouldIndexAfterImport(req) {
    return req.body.index_after_import === true || req.body.index_after_import === 'true' || req.body.index_after_import === 'on';
  }

  static hasFullImportContent(metadata = {}) {
    return Boolean(metadata && (metadata.extracted_text || metadata.extracted_markdown));
  }

  static parseJsonCell(value, fallback = null) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  static normalizeSourcePayload(row = {}) {
    const name = String(row.name || row.source_name || '').trim();
    const sourceUrl = String(row.source_url || '').trim();
    const slug = String(row.slug || row.source_slug || AdminCatalogController.slugify(name || sourceUrl)).trim();
    const state = String(row.state || row.source_state || '').toUpperCase().trim();
    const schedule = String(row.schedule_type || '').trim();

    return {
      name,
      slug,
      source_url: sourceUrl,
      state: AdminCatalogController.VALID_UF.includes(state) ? state : null,
      city: row.city || row.source_city ? String(row.city || row.source_city).trim() : null,
      is_active: parseBoolean(row.is_active ?? row.source_is_active, true),
      auto_update_enabled: parseBoolean(row.auto_update_enabled, false),
      auto_index_after_catalog: parseBoolean(row.auto_index_after_catalog, false),
      schedule_type: AdminCatalogController.VALID_SCHEDULE.includes(schedule) ? schedule : 'manual',
      max_documents: row.max_documents ? parseInt(row.max_documents, 10) || null : null,
      config_json: AdminCatalogController.parseJsonCell(row.config_json, null),
      last_status: 'idle',
    };
  }

  static async findOrCreateSourceForImport(row, sourceCache) {
    const cacheKey = [row.source_slug || row.slug, row.source_url, row.source_id, row.source_name || row.name]
      .filter(Boolean)
      .join('|');
    if (cacheKey && sourceCache.has(cacheKey)) {
      return sourceCache.get(cacheKey);
    }

    let source = null;
    const slug = String(row.source_slug || row.slug || '').trim();
    const sourceUrl = String(row.source_url || '').trim();

    if (slug) {
      source = await CatalogSource.findOne({ where: { slug } });
    }
    if (!source && sourceUrl) {
      source = await CatalogSource.findOne({ where: { source_url: sourceUrl } });
    }
    if (!source && row.source_id) {
      source = await CatalogSource.findByPk(row.source_id);
    }

    const payload = AdminCatalogController.normalizeSourcePayload(row);
    if (!payload.name && !payload.source_url) {
      return source;
    }

    if (!payload.name) payload.name = payload.slug || payload.source_url;
    if (!payload.slug) payload.slug = AdminCatalogController.slugify(payload.name || payload.source_url);
    if (!payload.source_url) payload.source_url = sourceUrl || `import://${payload.slug}`;

    if (source) {
      await source.update(payload);
    } else {
      source = await CatalogSource.create(payload);
    }

    if (cacheKey) sourceCache.set(cacheKey, source);
    return source;
  }

  static async refreshSourceTotals() {
    const counts = await CatalogDocument.findAll({
      attributes: ['source_id', [fn('COUNT', col('id')), 'count']],
      group: ['source_id'],
      raw: true,
    });
    const countMap = counts.reduce((acc, item) => {
      acc[item.source_id] = Number(item.count || 0);
      return acc;
    }, {});
    const sources = await CatalogSource.findAll({ attributes: ['id'] });
    await Promise.all(sources.map((source) => source.update({
      total_documents: countMap[source.id] || 0,
      last_status: 'idle',
    })));
  }

  static async clearCatalogData({ includeSources = false } = {}) {
    await CatalogDocument.destroy({ where: {} });
    await CatalogRun.destroy({ where: {} });
    if (includeSources) {
      await CatalogSource.destroy({ where: {} });
      return;
    }
    await CatalogSource.update({
      last_status: 'idle',
      total_documents: 0,
      last_run_at: null,
    }, { where: {} });
  }

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
      const slug = req.body.slug || AdminCatalogController.slugify(req.body.name);
      const uf = String(req.body.state || '').toUpperCase().trim();
      await CatalogSource.create({
        name: req.body.name,
        slug,
        source_url: req.body.source_url,
        state: AdminCatalogController.VALID_UF.includes(uf) ? uf : null,
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

      const uf = String(req.body.state || '').toUpperCase().trim();

      await source.update({
        name: req.body.name || source.name,
        source_url: req.body.source_url || source.source_url,
        state: AdminCatalogController.VALID_UF.includes(uf) ? uf : null,
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
          { key: 'source_slug', getter: (row) => (row.source && row.source.slug) || '' },
          { key: 'source_url', getter: (row) => (row.source && row.source.source_url) || '' },
          { key: 'source_state', getter: (row) => (row.source && row.source.state) || '' },
          { key: 'source_city', getter: (row) => (row.source && row.source.city) || '' },
          { key: 'external_id', getter: (row) => row.external_id || '' },
          { key: 'tipo', getter: (row) => row.tipo || '' },
          { key: 'numero_ano', getter: (row) => row.numero_ano || '' },
          { key: 'descricao', getter: (row) => row.descricao || '' },
          { key: 'ementa', getter: (row) => row.ementa || '' },
          { key: 'data_documento', getter: (row) => row.data_documento || '' },
          { key: 'data_publicacao', getter: (row) => row.data_publicacao || '' },
          { key: 'download_url', getter: (row) => row.download_url || '' },
          { key: 'detalhe_url', getter: (row) => row.detalhe_url || '' },
          { key: 'pagina_origem', getter: (row) => row.pagina_origem || '' },
          { key: 'row_hash', getter: (row) => row.row_hash || '' },
          { key: 'extension', getter: (row) => row.extension || '' },
          { key: 'status', getter: (row) => row.status || '' },
          { key: 'metadata_json', getter: (row) => JSON.stringify(row.metadata_json || {}) },
        ];

        if (mode === 'full') {
          columns.push(
            {
              key: 'extracted_text',
              getter: (row) => {
                const meta = row.metadata_json || {};
                return meta.extracted_text || '';
              },
            },
            {
              key: 'raw_text',
              getter: (row) => {
                const meta = row.metadata_json || {};
                return meta.raw_text || '';
              },
            },
            {
              key: 'extracted_markdown',
              getter: (row) => {
                const meta = row.metadata_json || {};
                return meta.extracted_markdown || '';
              },
            },
          );
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
        { key: 'config_json', getter: (row) => JSON.stringify(row.config_json || {}) },
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

      const importMode = AdminCatalogController.parseImportMode(req);
      if (importMode === 'replace') {
        await AdminCatalogController.clearCatalogData({ includeSources: true });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let indexed = 0;
      let indexFailed = 0;
      const indexAfterImport = AdminCatalogController.shouldIndexAfterImport(req);
      const documentsToIndex = [];
      const sourceCache = new Map();

      for (const row of rows) {
        if (!row.external_id) {
          skipped += 1;
          continue;
        }

        const source = await AdminCatalogController.findOrCreateSourceForImport(row, sourceCache);
        if (!source) {
          skipped += 1;
          continue;
        }

        const importedMeta = AdminCatalogController.parseJsonCell(row.metadata_json, {});
        const metadata = importedMeta && typeof importedMeta === 'object' && !Array.isArray(importedMeta)
          ? { ...importedMeta }
          : {};

        if (row.extracted_text) metadata.extracted_text = row.extracted_text;
        if (row.raw_text) metadata.raw_text = row.raw_text;
        if (row.extracted_markdown) metadata.extracted_markdown = row.extracted_markdown;
        if (AdminCatalogController.hasFullImportContent(metadata)) {
          metadata.imported_from_csv = true;
          metadata.imported_has_full_content = true;
          metadata.last_extraction_error = null;
        }

        const payload = {
          source_id: source.id,
          external_id: row.external_id,
          source_name: row.source_name || source.name || null,
          tipo: row.tipo || null,
          numero_ano: row.numero_ano || null,
          descricao: row.descricao || null,
          ementa: row.ementa || null,
          data_documento: row.data_documento || null,
          data_publicacao: row.data_publicacao || null,
          download_url: row.download_url || null,
          detalhe_url: row.detalhe_url || null,
          pagina_origem: row.pagina_origem ? parseInt(row.pagina_origem, 10) || null : null,
          row_hash: row.row_hash || null,
          extension: row.extension || null,
          status: ['indexed', 'pending', 'error'].includes(row.status) ? row.status : 'pending',
          metadata_json: Object.keys(metadata).length > 0 ? metadata : null,
        };

        if (payload.metadata_json?.extracted_text || payload.metadata_json?.raw_text || payload.metadata_json?.extracted_markdown) {
          if (payload.status === 'pending') payload.status = 'indexed';
        }

        const existing = await CatalogDocument.findOne({
          where: { source_id: payload.source_id, external_id: payload.external_id },
        });

        if (existing) {
          if (payload.metadata_json && existing.metadata_json) {
            payload.metadata_json = { ...existing.metadata_json, ...payload.metadata_json };
          }
          await existing.update(payload);
          if (indexAfterImport && AdminCatalogController.hasFullImportContent(payload.metadata_json)) {
            documentsToIndex.push(existing.id);
          }
          updated += 1;
        } else {
          const document = await CatalogDocument.create(payload);
          if (indexAfterImport && AdminCatalogController.hasFullImportContent(payload.metadata_json)) {
            documentsToIndex.push(document.id);
          }
          created += 1;
        }
      }

      await AdminCatalogController.refreshSourceTotals();

      if (indexAfterImport && documentsToIndex.length > 0) {
        for (const documentId of documentsToIndex) {
          const document = await CatalogDocument.findByPk(documentId, {
            include: [{ model: CatalogSource, as: 'source' }],
          });
          if (!document) continue;
          const ok = await indexer.indexCatalogDocument(document);
          if (ok) {
            indexed += 1;
            await document.update({
              status: 'indexed',
              metadata_json: {
                ...(document.metadata_json || {}),
                indexed_at: new Date().toISOString(),
                last_index_error: null,
              },
            });
          } else {
            indexFailed += 1;
            await document.update({
              status: 'error',
              metadata_json: {
                ...(document.metadata_json || {}),
                last_index_error: 'Falha ao indexar documento importado.',
              },
            });
          }
        }
      }

      return res.json({
        created,
        updated,
        skipped,
        indexed,
        indexFailed,
        mode: importMode,
        total: created + updated,
      });
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

      const importMode = AdminCatalogController.parseImportMode(req);
      if (importMode === 'replace') {
        await AdminCatalogController.clearCatalogData({ includeSources: true });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        const payload = AdminCatalogController.normalizeSourcePayload(row);

        if (!payload.name || !payload.slug || !payload.source_url) {
          skipped += 1;
          continue;
        }

        const existing = await CatalogSource.findOne({
          where: { [Op.or]: [{ slug: payload.slug }, { source_url: payload.source_url }] },
        });

        if (existing) {
          await existing.update(payload);
          updated += 1;
        } else {
          await CatalogSource.create(payload);
          created += 1;
        }
      }

      await AdminCatalogController.refreshSourceTotals();

      return res.json({
        created,
        updated,
        skipped,
        mode: importMode,
        total: created + updated,
      });
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
      await AdminCatalogController.clearCatalogData({ includeSources: false });

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
