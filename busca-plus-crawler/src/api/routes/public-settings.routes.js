const express = require('express');
const aiSettingsService = require('../../services/ai-settings.service');

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

module.exports = router;
