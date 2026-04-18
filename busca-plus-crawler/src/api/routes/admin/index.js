const express = require('express');
const router = express.Router();
const models = require('../../../models');
const { Op } = require('sequelize');
const indexer = require('../../../libs/indexer');
const aiSettingsService = require('../../../services/ai-settings.service');

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

    const result = sources.map(s => ({
      ...s.toJSON(),
      pageCount: s.pages?.length || 0
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

    res.render('admin/layout', {
      title: 'Páginas',
      currentPage: 'pages',
      partial: 'pages',
      data: { data: rows, total: count, page: parseInt(page), pages: Math.ceil(count / limit) },
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
