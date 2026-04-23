const express = require('express');

const aiSettingsService = require('../../../services/ai-settings.service');
const aiRetrievalService = require('../../../modules/ai/ai-retrieval.service');

const router = express.Router();

router.get('/ai-settings', (req, res) => {
  return res.json(aiSettingsService.getSettings());
});

router.post('/ai-settings', (req, res) => {
  const settings = aiSettingsService.updateSettings(req.body || {});

  return res.json({
    message: 'Configuracoes de IA salvas com sucesso.',
    settings,
    savedAt: new Date().toISOString(),
  });
});

router.get('/ai-embeddings/stats', async (req, res, next) => {
  try {
    return res.json(await aiRetrievalService.getStats());
  } catch (error) {
    return next(error);
  }
});

router.post('/ai-embeddings/process', async (req, res, next) => {
  try {
    const result = await aiRetrievalService.processPending({
      limit: req.body?.limit,
      force: Boolean(req.body?.force),
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

router.post('/ai-embeddings/cache/clear', async (req, res, next) => {
  try {
    const deleted = await aiRetrievalService.clearSummaryCache();
    return res.json({ deleted });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
