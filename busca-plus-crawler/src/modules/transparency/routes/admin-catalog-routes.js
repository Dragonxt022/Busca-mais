const express = require('express');
const { AdminCatalogController } = require('../controllers/admin-catalog-controller');

const router = express.Router();

router.get('/', AdminCatalogController.index);
router.post('/', AdminCatalogController.createSource);
router.post('/clear-queue', AdminCatalogController.clearQueue);
router.post('/reset-all', AdminCatalogController.resetAll);
router.post('/:id/run', AdminCatalogController.runCatalog);
router.get('/:id/documents', AdminCatalogController.showDocuments);

module.exports = router;