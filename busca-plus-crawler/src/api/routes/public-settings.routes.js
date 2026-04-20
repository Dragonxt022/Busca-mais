const express = require('express');
const aiSettingsService = require('../../services/ai-settings.service');

const router = express.Router();

router.get('/ai-settings', (_req, res) => {
  const settings = aiSettingsService.getSettings();
  res.json({
    enabled: Boolean(settings.enabled),
    provider: settings.provider,
    features: {
      pageSummary: Boolean(settings.features?.pageSummary),
      searchReport: Boolean(settings.features?.searchReport),
    },
  });
});

module.exports = router;
