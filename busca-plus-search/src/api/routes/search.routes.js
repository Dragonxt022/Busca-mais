const express = require('express');
const searchController = require('../controllers/search.controller');

const router = express.Router();

router.get('/', searchController.index);
router.get('/api/search', searchController.search);
router.get('/api/images', searchController.searchImages);
router.get('/page/:id', searchController.getPage);
router.get('/api/suggestions', searchController.suggestions);

module.exports = router;
