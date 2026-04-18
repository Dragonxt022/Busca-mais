require('dotenv').config();
const { CujubimPublicacoesCrawler } = require('./src/modules/transparency/crawlers/cujubim-publicacoes-crawler');

async function main() {
  const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.log('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => console.log('[DEBUG]', ...args),
  };

  const crawler = new CujubimPublicacoesCrawler({
    logger,
    maxPages: 10,
    headless: true,
  });

  try {
    logger.info('Iniciando crawl de catalogo (max 10 paginas)...');
    const items = await crawler.crawlCatalog();
    logger.info(`Concluido! Total de itens: ${items.length}`);
    console.log('Primeiros 3 itens:');
    items.slice(0, 3).forEach((item, i) => {
      console.log(`\n--- Item ${i + 1} ---`);
      console.log(`external_id: ${item.external_id}`);
      console.log(`pagina_origem: ${item.pagina_origem}`);
      console.log(`descricao: ${item.descricao?.substring(0, 100)}...`);
    });
  } catch (err) {
    logger.error('Erro no crawl:', err.message);
    console.error(err);
  }

  process.exit(0);
}

main();