const express = require('express');
const emailSettingsService = require('../../../services/email-settings.service');

const router = express.Router();

router.get('/email-settings', (_req, res) => {
  return res.json(emailSettingsService.getPublicSettings());
});

router.post('/email-settings', (req, res) => {
  const settings = emailSettingsService.updateSettings(req.body || {});
  return res.json({
    message: 'Configuracoes de e-mail salvas com sucesso.',
    settings: {
      ...settings,
      password: settings.password ? '********' : '',
      configured: Boolean(settings.enabled && settings.host && settings.fromEmail),
    },
    savedAt: new Date().toISOString(),
  });
});

module.exports = router;
