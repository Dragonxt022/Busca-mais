const express = require('express');
const router = express.Router();
const { Page, Source, CrawlJob, SearchLog } = require('../../../models');
const { Op } = require('sequelize');
const indexer = require('../../../libs/indexer');

router.get('/stats', async (req, res) => {
  try {
    const totalSources = await Source.count();
    const activeSources = await Source.count({ where: { is_active: true } });
    const totalPages = await Page.count();
    const indexedPages = await Page.count({ where: { last_indexed_at: { [Op.ne]: null } } });
    const pagesWithErrors = await Page.count({ where: { has_error: true } });
    const recentPages = await Page.count({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    });
    
    const recentJobs = await CrawlJob.findAll({
      limit: 10,
      order: [['created_at', 'DESC']],
      include: [{ model: Source, as: 'source' }]
    });

    const indexStats = await indexer.getStats();

    res.json({
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
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/sources', async (req, res) => {
  try {
    const sources = await Source.findAll({
      order: [['created_at', 'DESC']],
      include: [{
        model: Page,
        as: 'pages',
        attributes: ['id']
      }]
    });

    const result = sources.map(s => ({
      ...s.toJSON(),
      pageCount: s.pages?.length || 0
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    res.json({
      data: rows,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    
    const where = {};
    if (status) where.status = status;

    const { count, rows } = await CrawlJob.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']],
      include: [{ model: Source, as: 'source' }]
    });

    res.json({
      data: rows,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    res.json({
      data: rows,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search-logs', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const { count, rows } = await SearchLog.findAndCountAll({
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']]
    });

    res.json({
      data: rows,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search-stats', async (req, res) => {
  try {
    const topSearches = await SearchLog.findAll({
      attributes: [
        'query',
        [sequelize.fn('COUNT', sequelize.col('query')), 'count']
      ],
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      group: ['query'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 20
    });

    const totalSearches = await SearchLog.count({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }
    });

    res.json({
      topSearches,
      totalSearches,
      period: '7 days'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reindex-all', async (req, res) => {
  try {
    const pages = await Page.findAll({
      where: { is_active: true },
      include: [{ model: Source, as: 'source' }]
    });

    const result = await indexer.indexPages(pages);
    res.json({ message: 'Reindex started', ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
