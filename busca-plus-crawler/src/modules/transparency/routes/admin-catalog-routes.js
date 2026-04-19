const express = require('express');
const { AdminCatalogController } = require('../controllers/admin-catalog-controller');

const router = express.Router();

router.get('/', AdminCatalogController.index);
router.post('/', AdminCatalogController.createSource);
router.get('/export.csv', AdminCatalogController.exportSourcesCsv);
router.post('/import', AdminCatalogController.importSourcesCsv);
router.post('/import-documents', AdminCatalogController.importDocumentsCsv);
router.post('/clear-queue', AdminCatalogController.clearQueue);
router.post('/reset-all', AdminCatalogController.resetAll);
router.post('/:id/run', AdminCatalogController.runCatalog);
router.post('/:id/index', AdminCatalogController.queueIndex);
router.get('/:id/documents', AdminCatalogController.showDocuments);
router.put('/:id', AdminCatalogController.updateSource);
router.delete('/:id', AdminCatalogController.deleteSource);

module.exports = router;
