const { CujubimPublicacoesCrawler } = require('../crawlers/cujubim-publicacoes-crawler');
const { CatalogSource, CatalogRun, CatalogDocument } = require('../../../models');

class CatalogService {
  constructor({ logger, sequelize }) {
    this.logger = logger || console;
    this.sequelize = sequelize;
  }

  async runCreateOrUpdate(sourceId, { type = 'update', maxPages = null } = {}) {
    const source = await CatalogSource.findByPk(sourceId);
    if (!source) throw new Error('Fonte de catálogo não encontrada');

    const run = await CatalogRun.create({
      source_id: source.id,
      type,
      status: 'running',
      started_at: new Date(),
      new_items: 0,
      updated_items: 0,
      failed_items: 0,
      message: 'Catalogação iniciada',
    });

    try {
      const crawler = new CujubimPublicacoesCrawler({
        logger: this.logger,
        maxPages,
        headless: true,
      });

      const items = await crawler.crawlCatalog();

      let newItems = 0;
      let updatedItems = 0;
      let failedItems = 0;

      for (const item of items) {
        try {
          if (!item.external_id) {
            this.logger.warn(`[catalog] Skipping item without external_id`);
            failedItems++;
            continue;
          }
          
          const [doc, created] = await CatalogDocument.findOrCreate({
            where: {
              source_id: source.id,
              external_id: item.external_id,
            },
            defaults: {
              source_id: source.id,
              ...item,
            },
          });

          if (created) {
            newItems++;
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
            });
            updatedItems++;
          }
        } catch (err) {
          this.logger.warn(`[catalog] Error processing item ${item.external_id}: ${err.message}`);
          failedItems++;
        }
      }

      await source.update({
        last_run_at: new Date(),
        last_status: 'success',
        total_documents: await CatalogDocument.count({ where: { source_id: source.id } }),
      });

      await run.update({
        status: 'success',
        finished_at: new Date(),
        new_items: newItems,
        updated_items: updatedItems,
        failed_items: failedItems,
        message: `Catalogação concluída. Novos: ${newItems}, Atualizados: ${updatedItems}, Falhas: ${failedItems}`,
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
