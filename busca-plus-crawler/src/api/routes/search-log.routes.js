const express = require('express');
const { SearchLog } = require('../../models');
const { attachUser } = require('../middlewares/auth.middleware');

const router = express.Router();

function normalizeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeSearchType(value) {
  const type = String(value || 'web').trim().toLowerCase();
  return ['web', 'images'].includes(type) ? type : 'web';
}

router.use(attachUser);

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    const bodyFilters = body.filters && typeof body.filters === 'object' ? body.filters : {};
    const query = normalizeQuery(body.query);
    if (!query) {
      return res.status(400).json({ error: 'Query obrigatoria.' });
    }

    const filters = {
      ...bodyFilters,
      sourceId: body.sourceId || bodyFilters.sourceId || null,
      searchType: normalizeSearchType(body.searchType),
      userAgent: String(body.userAgent || req.headers['user-agent'] || '').slice(0, 300),
      ip: String(body.ip || req.ip || '').slice(0, 80),
    };

    const log = await SearchLog.create({
      query,
      normalized_query: query.toLowerCase(),
      total_results: Number.parseInt(body.resultsCount, 10) || 0,
      user_session: req.user ? `user:${req.user.id}` : String(body.userSession || '').slice(0, 100) || null,
      filters_json: filters,
    });

    return res.status(201).json({ ok: true, id: log.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
