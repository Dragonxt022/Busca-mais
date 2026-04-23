const express = require('express');
const aiSettingsService = require('../../services/ai-settings.service');
const { Op } = require('sequelize');

const { Source, SearchableSource, CatalogSource, ContentItem, CatalogDocument, SearchLog, sequelize } = require('../../models');

let _trendingCache = null;
let _trendingCacheTime = 0;
const TRENDING_TTL = 2 * 60 * 1000;

const router = express.Router();

router.get('/ai-settings', (_req, res) => {
  const settings = aiSettingsService.getSettings();
  res.json({
    enabled: Boolean(settings.enabled),
    provider: settings.provider,
    summaryMaxCharacters: settings.summaryMaxCharacters,
    features: {
      pageSummary: Boolean(settings.features?.pageSummary),
      searchReport: Boolean(settings.features?.searchReport),
      searchOverview: Boolean(settings.features?.searchOverview),
      embeddings: Boolean(settings.features?.embeddings),
    },
    ollama: {
      enabled: Boolean(settings.ollama?.enabled),
      baseUrl: settings.ollama?.baseUrl || '',
      model: settings.ollama?.model || '',
    },
    google: {
      enabled: Boolean(settings.google?.enabled),
      apiKey: settings.google?.apiKey || '',
      model: settings.google?.model || '',
      apiUrl: settings.google?.apiUrl || '',
    },
  });
});

router.get('/search-home-stats', async (req, res) => {
  try {
    const state = String(req.query.state || '').trim().toUpperCase();
    const city = String(req.query.city || '').trim();
    const where = { is_active: true };

    if (state) where.state = state;
    if (city) where.city = city;

    const [legacySources, engineSources, catalogSources, indexedItems, indexedCatalogDocuments] = await Promise.all([
      Source.count({ where }),
      SearchableSource.count({ where }),
      CatalogSource.count({ where }),
      ContentItem.count({ where: { ...where, status: 'indexed' } }),
      CatalogDocument.count({ where: { ...where, status: { [Op.in]: ['indexed', 'completed'] } } }),
    ]);

    res.json({
      totalSources: Number(legacySources || 0) + Number(engineSources || 0) + Number(catalogSources || 0),
      totalIndexedItems: Number(indexedItems || 0) + Number(indexedCatalogDocuments || 0),
      state: state || null,
      city: city || null,
    });
  } catch (error) {
    res.json({
      totalSources: 0,
      totalIndexedItems: 0,
      state: null,
      city: null,
      error: error.message,
    });
  }
});

router.get('/top-searches', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 15);

  if (!q) {
    const now = Date.now();
    if (_trendingCache && now - _trendingCacheTime < TRENDING_TTL) {
      return res.json(_trendingCache);
    }
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const where = {
      created_at: { [Op.gte]: since },
      normalized_query: q.length >= 1
        ? { [Op.like]: `${q}%`, [Op.ne]: null }
        : { [Op.ne]: null },
    };

    const rows = await SearchLog.findAll({
      attributes: [
        'normalized_query',
        [sequelize.fn('COUNT', sequelize.col('id')), 'cnt'],
      ],
      where,
      group: ['normalized_query'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      limit,
    });

    const result = rows
      .map(r => ({ query: r.normalized_query, count: parseInt(r.get('cnt'), 10) }))
      .filter(r => r.query && r.query.length >= 2);

    if (!q) {
      _trendingCache = result;
      _trendingCacheTime = Date.now();
    }

    return res.json(result);
  } catch (_err) {
    return res.json(_trendingCache || []);
  }
});

module.exports = router;
