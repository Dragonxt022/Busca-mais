const express = require('express');
const router = express.Router();
const searchController = require('../api/controllers/search.controller');

router.get('/', (req, res, next) => searchController.index(req, res, next));
router.get('/api/search', (req, res, next) => searchController.search(req, res, next));
router.get('/api/images', (req, res, next) => searchController.searchImages(req, res, next));
router.get('/page/:id', (req, res, next) => searchController.getPage(req, res, next));
router.get('/api/suggestions', (req, res, next) => searchController.suggestions(req, res, next));

module.exports = router;
