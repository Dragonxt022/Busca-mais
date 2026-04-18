const { CujubimPublicacoesCrawler } = require('../crawlers/cujubim-publicacoes-crawler');
const { CatalogSource, CatalogRun, CatalogDocument } = require('../../../models');
const catalogIndexService = require('./catalog-index.service');

class CatalogService {
  constructor({ logger, sequelize }) {
    this.logger = logger || console;
    this.sequelize = sequelize;
  }

  async runCreateOrUpdate(sourceId, { type = 'update', maxPages = null } = {}) {
    const source = await CatalogSource.findByPk(sourceId);
    if (!source) {
      throw new Error('Fonte de catalogo nao encontrada');
    }

    const run = await CatalogRun.create({
      source_id: source.id,
      type,
      status: 'running',
      started_at: new Date(),
      new_items: 0,
      updated_items: 0,
      failed_items: 0,
      message: 'Catalogacao iniciada',
    });

    try {
      const crawler = new CujubimPublicacoesCrawler({
        logger: this.logger,
        maxPages,
        headless: true,
        shouldContinue: async () => {
          const currentRun = await CatalogRun.findByPk(run.id, {
            attributes: ['status'],
          });

          return currentRun?.status === 'running';
        },
      });

      const items = await crawler.crawlCatalog();

      let newItems = 0;
      let updatedItems = 0;
      let failedItems = 0;

      for (const item of items) {
        try {
          if (!item.external_id) {
            this.logger.warn('[catalog] Skipping item without external_id');
            failedItems += 1;
            continue;
          }

          let doc = await CatalogDocument.findOne({
            where: {
              source_id: source.id,
              external_id: item.external_id,
            },
          });

          if (!doc) {
            doc = await CatalogDocument.findOne({
              where: {
                download_url: item.download_url,
              },
            });
          }

          if (!doc) {
            await CatalogDocument.create({
              source_id: source.id,
              ...item,
            });
            newItems += 1;
            continue;
          }

          const changed =
            doc.row_hash !== item.row_hash ||
            doc.download_url !== item.download_url ||
            doc.descricao !== item.descricao ||
            doc.ementa !== item.ementa;

          if (changed) {
            await doc.update({
              ...item,
              source_id: source.id,
              status: 'pending',
            });
            updatedItems += 1;
          }
        } catch (err) {
          if (err.message && err.message.includes('unique constraint')) {
            this.logger.warn(`[catalog] Duplicate detected for ${item.external_id}, skipping`);
            continue;
          }
          this.logger.warn(`[catalog] Error processing item ${item.external_id}: ${err.message}`);
          failedItems += 1;
        }
      }

      await source.update({
        last_run_at: new Date(),
        last_status: 'success',
        total_documents: await CatalogDocument.count({ where: { source_id: source.id } }),
      });

      let message = `Catalogacao concluida. Novos: ${newItems}, Atualizados: ${updatedItems}, Falhas: ${failedItems}`;
      const metadata = {};

      if (source.auto_index_after_catalog) {
        const queueResult = await catalogIndexService.queueSourceDocuments(source.id, {
          onlyPending: false,
          resetErrored: true,
        });
        metadata.queued_for_index = queueResult.queued;
        message = `${message}. Indexados em fila: ${queueResult.queued}`;
      }

      await run.update({
        status: 'success',
        finished_at: new Date(),
        new_items: newItems,
        updated_items: updatedItems,
        failed_items: failedItems,
        metadata_json: metadata,
        message,
      });

      return run;
    } catch (error) {
      await source.update({
        last_run_at: new Date(),
        last_status: 'error',
      }).catch(() => {});

      await run.update({
        status: 'error',
        finished_at: new Date(),
        message: error.message,
      }).catch(() => {});

      throw error;
    }
  }
}

module.exports = { CatalogService };
