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
router.get('/api/suggestions', searchController.suggestions);

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

module.exports = router;
