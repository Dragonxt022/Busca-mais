const express = require('express');

const aiRetrievalService = require('../../modules/ai/ai-retrieval.service');

const router = express.Router();

router.get('/search-overview', async (req, res) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    if (!query) {
      return res.status(400).json({ error: 'Pesquisa obrigatoria.' });
    }

    const result = await aiRetrievalService.generateSearchOverview(query, {
      sourceId: req.query.sourceId || null,
      state: req.query.state || null,
      city: req.query.city || null,
    });

    return res.json({
      ...result,
      query,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;
