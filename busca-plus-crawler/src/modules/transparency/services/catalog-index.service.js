const { CatalogDocument, CatalogSource } = require('../../../models');
const { indexQueue } = require('../../../libs/queue');
const { logger } = require('../../../libs/logger');

class CatalogIndexService {
  buildJobId(documentId) {
    return `catalog-index-${documentId}-${Date.now()}`;
  }

  async queueDocument(documentId) {
    const document = await CatalogDocument.findByPk(documentId);
    if (!document) {
      throw new Error('Documento de catalogo nao encontrado');
    }

    await indexQueue.add(
      'index-catalog-document',
      { catalogDocumentId: document.id },
      { jobId: this.buildJobId(document.id) }
    );

    await document.update({ status: 'pending' });
    logger.info(`Catalog document queued for index: ${document.id}`);

    return document;
  }

  async queueSourceDocuments(sourceId, options = {}) {
    const source = await CatalogSource.findByPk(sourceId);
    if (!source) {
      throw new Error('Fonte de catalogo nao encontrada');
    }

    const {
      limit = null,
      onlyPending = false,
      resetErrored = true,
    } = options;

    const where = { source_id: source.id };
    if (onlyPending) {
      where.status = 'pending';
    }

    const documents = await CatalogDocument.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: limit || undefined,
    });

    let queued = 0;

    for (const document of documents) {
      if (!resetErrored && document.status === 'error') {
        continue;
      }

      await indexQueue.add(
        'index-catalog-document',
        { catalogDocumentId: document.id },
        { jobId: this.buildJobId(document.id) }
      );

      if (document.status !== 'pending') {
        await document.update({ status: 'pending' });
      }

      queued += 1;
    }

    logger.info(`Queued ${queued} catalog documents for source ${source.id}`);

    return {
      queued,
      source,
      total: documents.length,
    };
  }
}

module.exports = new CatalogIndexService();
