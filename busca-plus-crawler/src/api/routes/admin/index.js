const express = require('express');
const router = express.Router();
const models = require('../../../models');
const { Op } = require('sequelize');
const indexer = require('../../../libs/indexer');
const aiSettingsService = require('../../../services/ai-settings.service');
const { parseBoolean, parseCsv, parseNullableInt, serializeCsv } = require('../../../utils/csv');

const { Page, Source, CrawlJob, SearchLog } = models;

router.get('/', async (req, res) => {
  try {
    const totalSources = await Source.count();
    const activeSources = await Source.count({ where: { is_active: true } });
    const totalPages = await Page.count();
    const indexedPages = await Page.count({ where: { last_indexed_at: { [Op.ne]: null } } });
    const pagesWithErrors = await Page.count({ where: { has_error: true } });
    const recentPages = await Page.count({
      where: { created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
    });

    const recentJobs = await CrawlJob.findAll({
      limit: 10,
      order: [['created_at', 'DESC']],
      include: [{ model: Source, as: 'source' }]
    });

    let indexStats = null;
    try {
      indexStats = await indexer.getStats();
    } catch (e) {}

    const stats = {
      sources: {
        total: totalSources,
        active: activeSources,
        inactive: totalSources - activeSources
      },
      pages: {
        total: totalPages,
        indexed: indexedPages,
        pending: totalPages - indexedPages,
        errors: pagesWithErrors,
        recent24h: recentPages
      },
      recentJobs,
      indexStats
    };

    res.render('admin/layout', {
      title: 'Dashboard',
      currentPage: 'dashboard',
      partial: 'dashboard',
      data: null,
      stats,
      pagination: null
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Erro ao carregar dashboard: ' + error.message);
  }
});

router.get('/sources', async (req, res) => {
  try {
    const sources = await Source.findAll({
      order: [['created_at', 'DESC']],
      include: [{ model: Page, as: 'pages', attributes: ['id'] }]
    });

    const pageStats = await Page.findAll({
      attributes: [
        'source_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'total_pages'],
        [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN "last_indexed_at" IS NOT NULL THEN 1 ELSE 0 END')), 'indexed_pages'],
        [models.sequelize.fn('SUM', models.sequelize.literal('CASE WHEN "has_error" = TRUE THEN 1 ELSE 0 END')), 'error_pages']
      ],
      group: ['source_id'],
      raw: true
    });

    const statsBySourceId = pageStats.reduce((acc, item) => {
      const totalPages = Number(item.total_pages || 0);
      const indexedPages = Number(item.indexed_pages || 0);
      const errorPages = Number(item.error_pages || 0);

      acc[item.source_id] = {
        totalPages,
        indexedPages,
        errorPages,
        pendingPages: Math.max(totalPages - indexedPages, 0),
        progressPercent: totalPages > 0 ? Math.round((indexedPages / totalPages) * 100) : 0,
      };

      return acc;
    }, {});

    const result = sources.map(s => ({
      ...s.toJSON(),
      pageCount: s.pages?.length || 0,
      indexProgress: statsBySourceId[s.id] || {
        totalPages: s.pages?.length || 0,
        indexedPages: 0,
        errorPages: 0,
        pendingPages: s.pages?.length || 0,
        progressPercent: 0,
      }
    }));

    res.render('admin/layout', {
      title: 'Fontes',
      currentPage: 'sources',
      partial: 'sources',
      data: result,
      stats: null,
      pagination: null
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar fontes: ' + error.message);
  }
});

router.get('/sources/export.csv', async (req, res) => {
  try {
    const mode = req.query.mode || 'sources';

    if (mode === 'pages' || mode === 'full') {
      const pages = await Page.findAll({
        include: [{ model: Source, as: 'source', attributes: ['name', 'base_url'] }],
        order: [['created_at', 'DESC']],
      });

      const columns = [
        { key: 'id', getter: (row) => row.id },
        { key: 'source_id', getter: (row) => row.source_id },
        { key: 'source_name', getter: (row) => (row.source && row.source.name) || '' },
        { key: 'url', getter: (row) => row.url },
        { key: 'title', getter: (row) => row.title || '' },
        { key: 'description', getter: (row) => row.description || '' },
        { key: 'word_count', getter: (row) => row.word_count || 0 },
        { key: 'has_error', getter: (row) => row.has_error || false },
        { key: 'last_crawled_at', getter: (row) => row.last_crawled_at || '' },
        { key: 'last_indexed_at', getter: (row) => row.last_indexed_at || '' },
      ];

      if (mode === 'full') {
        columns.push({ key: 'content_text', getter: (row) => row.content_text || '' });
      }

      const rows = pages.map((p) => p.get({ plain: true }));
      const csv = serializeCsv(rows, columns);
      const filename = mode === 'full' ? 'paginas-com-conteudo.csv' : 'paginas.csv';

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(`\uFEFF${csv}`);
    }

    const sources = await Source.findAll({ order: [['created_at', 'DESC']] });
    const csv = serializeCsv(sources, [
      { key: 'id', getter: (row) => row.id },
      { key: 'name', getter: (row) => row.name },
      { key: 'base_url', getter: (row) => row.base_url },
      { key: 'type', getter: (row) => row.type || 'website' },
      { key: 'category', getter: (row) => row.category || 'general' },
      { key: 'is_active', getter: (row) => row.is_active },
      { key: 'crawl_depth', getter: (row) => row.crawl_depth },
      { key: 'follow_internal_links', getter: (row) => row.follow_internal_links },
      { key: 'download_images', getter: (row) => row.download_images },
      { key: 'take_screenshots', getter: (row) => row.take_screenshots },
      { key: 'delay_between_requests', getter: (row) => row.delay_between_requests },
      { key: 'user_agent', getter: (row) => row.user_agent || '' },
      { key: 'schedule', getter: (row) => row.schedule || '' },
      { key: 'state', getter: (row) => row.state || '' },
      { key: 'city', getter: (row) => row.city || '' },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fontes.csv"');
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return res.status(500).json({ error: `Erro ao exportar fontes: ${error.message}` });
  }
});

router.post('/sources/import', async (req, res) => {
  try {
    const rows = parseCsv(req.body.csv_text || '');
    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV vazio ou invalido' });
    }

    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const payload = {
        name: row.name,
        base_url: row.base_url || row.url,
        type: row.type || 'website',
        category: row.category || 'general',
        is_active: parseBoolean(row.is_active, true),
        crawl_depth: parseNullableInt(row.crawl_depth, 3) || 3,
        follow_internal_links: parseBoolean(row.follow_internal_links, true),
        download_images: parseBoolean(row.download_images, false),
        take_screenshots: parseBoolean(row.take_screenshots, false),
        delay_between_requests: parseNullableInt(row.delay_between_requests, 1000) || 1000,
        user_agent: row.user_agent || null,
        schedule: row.schedule || null,
        state: row.state || null,
        city: row.city || null,
      };

      if (!payload.name || !payload.base_url) {
        continue;
      }

      const existing = row.id
        ? await Source.findByPk(row.id)
        : await Source.findOne({ where: { base_url: payload.base_url } });

      if (existing) {
        await existing.update(payload);
        updated += 1;
      } else {
        await Source.create(payload);
        created += 1;
      }
    }

    return res.json({ created, updated, total: created + updated });
  } catch (error) {
    return res.status(500).json({ error: `Erro ao importar fontes: ${error.message}` });
  }
});

router.get('/sources/:id', async (req, res) => {
  try {
    const source = await Source.findByPk(req.params.id);
    if (!source) {
      return res.status(404).send('Fonte nao encontrada');
    }

    res.render('admin/layout', {
      title: 'Editar Fonte',
      currentPage: 'sources',
      partial: 'source-edit',
      data: source.toJSON(),
      stats: null,
      pagination: null
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar fonte: ' + error.message);
  }
});

router.get('/pages', async (req, res) => {
  try {
    const { page = 1, limit = 50, sourceId, hasError, search } = req.query;

    const where = {};
    if (sourceId) where.source_id = sourceId;
    if (hasError === 'true') where.has_error = true;
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { url: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Page.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']],
      include: [{ model: Source, as: 'source' }]
    });

    const [indexedCount, errorCount] = await Promise.all([
      Page.count({
        where: {
          ...where,
          last_indexed_at: { [Op.ne]: null }
        }
      }),
      Page.count({
        where: {
          ...where,
          has_error: true
        }
      })
    ]);

    const progress = {
      total: count,
      indexed: indexedCount,
      error: errorCount,
      pending: Math.max(count - indexedCount, 0),
      progressPercent: count > 0 ? Math.round((indexedCount / count) * 100) : 0,
    };

    res.render('admin/layout', {
      title: 'Páginas',
      currentPage: 'pages',
      partial: 'pages',
      data: { data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit), progress },
      stats: null,
      pagination: { page: parseInt(page), ...req.query }
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar páginas: ' + error.message);
  }
});

router.get('/pages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const type = req.query.type;
    const crawlerUrl = process.env.CRAWLER_API_URL || `http://localhost:${process.env.PORT || 3001}`;

    let data = {};
    let detailType = 'page';

    if (type === 'catalog') {
      const { CatalogDocument, CatalogSource, Page } = models;
      const document = await CatalogDocument.findByPk(id, {
        include: [{ model: CatalogSource, as: 'source' }]
      });

      if (!document) {
        return res.status(404).send('Documento não encontrado');
      }

      let pageImages = [];
      if (document.pagina_origem) {
        const sourcePage = await Page.findByPk(document.pagina_origem);
        if (sourcePage && sourcePage.images) {
          const images = typeof sourcePage.images === 'string' 
            ? JSON.parse(sourcePage.images) 
            : sourcePage.images;
          pageImages = images.map(img => ({
            ...img,
            url: img.originalUrl || img.src || (img.localPath ? `${crawlerUrl}/${img.localPath}` : null),
            thumbnailUrl: img.thumbnailPath ? `${crawlerUrl}/${img.thumbnailPath}` : null,
          }));
        }
      }

      data = {
        ...document.toJSON(),
        sourcePage: document.pagina_origem || null,
        pageImages,
        isCatalogDocument: true,
        sourceName: document.source?.name || '',
        sourceId: document.source_id,
      };
      detailType = 'catalog';
    } else {
      const pageData = await Page.findByPk(id, {
        include: [{ model: Source, as: 'source' }]
      });

      if (!pageData) {
        return res.status(404).send('Página não encontrada');
      }

      let screenshotUrl = '';
      if (pageData.screenshot_path) {
        if (pageData.screenshot_path.startsWith('http')) {
          screenshotUrl = pageData.screenshot_path;
        } else {
          const filename = pageData.screenshot_path.split('/').pop();
          screenshotUrl = `${crawlerUrl}/screenshots/${filename}`;
        }
      }

      let domain = '';
      try {
        domain = new URL(pageData.url).hostname;
      } catch {}

      data = {
        ...pageData.toJSON(),
        screenshotUrl,
        domain,
        isCatalogDocument: false,
      };
    }

    res.render('admin/partials/pages/detail', {
      layout: false,
      detail: data,
      detailType,
      backUrl: type === 'catalog' ? `/admin/catalog/${data.sourceId}/documents` : '/admin/pages'
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar página: ' + error.message);
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;

    const where = {};
    if (status) where.status = status;

    const { count, rows } = await CrawlJob.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']],
      include: [{ model: Source, as: 'source' }]
    });

    res.render('admin/layout', {
      title: 'Jobs',
      currentPage: 'jobs',
      partial: 'jobs',
      data: { data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) },
      stats: null,
      pagination: { page: parseInt(page) }
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar jobs: ' + error.message);
  }
});

router.get('/errors', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const { count, rows } = await Page.findAndCountAll({
      where: { has_error: true },
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['updated_at', 'DESC']],
      include: [{ model: Source, as: 'source' }]
    });

    res.render('admin/layout', {
      title: 'Erros',
      currentPage: 'errors',
      partial: 'errors',
      data: { data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) },
      stats: null,
      pagination: { page: parseInt(page) }
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar erros: ' + error.message);
  }
});

router.get('/searches', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const { count, rows } = await SearchLog.findAndCountAll({
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']]
    });

    const topSearches = await models.sequelize.literal(`
      SELECT query, COUNT(*) as count 
      FROM search_logs 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY query 
      ORDER BY count DESC 
      LIMIT 20
    `);

    const totalSearches = await SearchLog.count({
      where: { created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    });

    res.render('admin/layout', {
      title: 'Buscas',
      currentPage: 'searches',
      partial: 'searches',
      data: { data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) },
      stats: { topSearches, totalSearches, period: '7 days' },
      pagination: { page: parseInt(page) }
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar buscas: ' + error.message);
  }
});

router.get('/ai-tools', async (req, res) => {
  try {
    res.render('admin/layout', {
      title: 'Ferramentas de IA',
      currentPage: 'ai-tools',
      partial: 'ai-tools',
      data: aiSettingsService.getSettings(),
      stats: null,
      pagination: null
    });
  } catch (error) {
    res.status(500).send('Erro ao carregar configuracoes de IA: ' + error.message);
  }
});

module.exports = router;
