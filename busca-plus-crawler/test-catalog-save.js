require('dotenv').config();
const { sequelize, CatalogSource, CatalogDocument } = require('./src/models');
const { CujubimPublicacoesCrawler } = require('./src/modules/transparency/crawlers/cujubim-publicacoes-crawler');

async function main() {
  const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.log('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
  };

  try {
    let source = await CatalogSource.findOne({ where: { name: 'cujubim_transparencia_publicacoes' } });
    if (!source) {
      source = await CatalogSource.create({
        name: 'cujubim_transparencia_publicacoes',
        name_display: 'Publicações - Cujubim',
        slug: 'cujubim-publicacoes',
        source_url: 'https://transparencia.cujubim.ro.gov.br',
        auto_index_after_catalog: false,
      });
      logger.info(`Source criada: ${source.id}`);
    } else {
      logger.info(`Source existente: ${source.id}`);
    }

    const crawler = new CujubimPublicacoesCrawler({
      logger,
      maxPages: 1,
      headless: true,
    });

    logger.info('Executando crawl (1 pagina)...');
    const items = await crawler.crawlCatalog();
    logger.info(`Itens coletados: ${items.length}`);

    let created = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        const existing = await CatalogDocument.findOne({
          where: { source_id: source.id, external_id: item.external_id },
        });
        if (existing) {
          skipped += 1;
          continue;
        }
        await CatalogDocument.create({
          source_id: source.id,
          ...item,
        });
        created += 1;
        if (created <= 5) {
          logger.info(`Criado: ${item.external_id} (pagina_origem=${item.pagina_origem})`);
        }
      } catch (err) {
        logger.error(`Erro ao criar ${item.external_id}: ${err.message}`);
      }
    }

    logger.info(`Concluido! Criados: ${created}, Skipped: ${skipped}`);
    logger.info(`Verificando insercao no banco...`);
    
    const count = await CatalogDocument.count({ where: { source_id: source.id } });
    logger.info(`Total documentos no banco para esta source: ${count}`);

  } catch (err) {
    logger.error('Erro:', err.message);
    console.error(err);
  } finally {
    await sequelize.close();
  }
  process.exit(0);
}

main();