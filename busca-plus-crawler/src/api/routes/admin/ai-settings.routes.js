const express = require('express');

const aiSettingsService = require('../../../services/ai-settings.service');

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

module.exports = router;
