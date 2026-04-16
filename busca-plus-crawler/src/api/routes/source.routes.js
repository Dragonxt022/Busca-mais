const express = require('express');
const router = express.Router();
const sourceController = require('../controllers/source.controller');

router.get('/', (req, res, next) => sourceController.list(req, res, next));
router.get('/:id', (req, res, next) => sourceController.getById(req, res, next));
router.post('/', (req, res, next) => sourceController.create(req, res, next));
router.put('/:id', (req, res, next) => sourceController.update(req, res, next));
router.delete('/:id', (req, res, next) => sourceController.delete(req, res, next));
router.post('/:id/crawl', (req, res, next) => sourceController.startCrawl(req, res, next));
router.get('/:id/crawl-status', (req, res, next) => sourceController.getCrawlStatus(req, res, next));
router.get('/:id/stats', (req, res, next) => sourceController.getStats(req, res, next));

module.exports = router;
