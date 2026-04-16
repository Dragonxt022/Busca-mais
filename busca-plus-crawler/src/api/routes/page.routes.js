const express = require('express');
const router = express.Router();
const pageController = require('../controllers/page.controller');

router.get('/', (req, res, next) => pageController.list(req, res, next));
router.get('/:id', (req, res, next) => pageController.getById(req, res, next));
router.post('/', (req, res, next) => pageController.create(req, res, next));
router.put('/:id', (req, res, next) => pageController.update(req, res, next));
router.delete('/:id', (req, res, next) => pageController.delete(req, res, next));
router.post('/:id/crawl', (req, res, next) => pageController.queueForCrawl(req, res, next));
router.post('/:id/reindex', (req, res, next) => pageController.reindex(req, res, next));
router.post('/bulk', (req, res, next) => pageController.bulkCreate(req, res, next));
router.get('/stats/overview', (req, res, next) => pageController.getStats(req, res, next));

module.exports = router;
