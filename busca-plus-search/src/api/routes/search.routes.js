const express = require('express');
const axios = require('axios');
const searchController = require('../controllers/search.controller');
const config = require('../../config');

const router = express.Router();

router.get('/', searchController.index);
router.get('/api/search', searchController.search);
router.get('/api/images', searchController.searchImages);
router.post('/api/page/:id/summary', searchController.summarizePage);
router.get('/api/report', searchController.generateSearchReport);
router.get('/page/:id', searchController.getPage);
router.get('/profile', (req, res) => {
  res.render('profile');
});
router.get('/api/suggestions', searchController.suggestions);
router.get('/reset-password', (req, res) => {
  res.render('reset-password', { token: req.query.token || '' });
});

router.all('/api/auth/{*path}', async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace(/^\/api\/auth/, '') || '';
    const response = await axios({
      method: req.method,
      url: `${config.crawler.apiUrl}/api/auth${targetPath}`,
      data: req.body,
      headers: {
        cookie: req.headers.cookie || '',
        authorization: req.headers.authorization || '',
      },
      validateStatus: () => true,
      timeout: 10000,
    });

    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }

    return res.status(response.status).json(response.data);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Falha ao comunicar com autenticacao.' });
  }
});

router.post('/api/sponsors/:id/click', async (req, res) => {
  try {
    await axios.post(`${config.crawler.apiUrl}/api/sponsors/${req.params.id}/click`, {}, { timeout: 2000 });
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

router.get('/api/cities', async (req, res) => {
  try {
    const qs = req.query.state ? `?state=${req.query.state}` : '';
    const { data } = await axios.get(`${config.crawler.apiUrl}/api/cities${qs}`, { timeout: 3000 });
    res.json(data);
  } catch {
    res.json([]);
  }
});

router.get('/api/ai-overview', async (req, res) => {
  try {
    const { q, sourceId, state, city } = req.query;
    const { data } = await axios.get(`${config.crawler.apiUrl}/api/ai/search-overview`, {
      params: { q, sourceId, state, city },
      timeout: 90000,
    });
    res.json(data);
  } catch (error) {
    const status = error.response?.status || 400;
    res.status(status).json({ error: error.response?.data?.error || error.message || 'Falha ao gerar visao geral.' });
  }
});

module.exports = router;
