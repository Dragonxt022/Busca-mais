require('dotenv').config();
const { sequelize, CatalogSource, CatalogDocument } = require('./src/models');
const catalogIndexService = require('./src/modules/transparency/services/catalog-index.service');

async function main() {
  try {
    const source = await CatalogSource.findOne({ where: { name: 'cujubim_transparencia_publicacoes' } });
    if (!source) {
      console.log('Source não encontrada');
      return;
    }
    console.log(`Source: ${source.name} (ID: ${source.id})`);

    const docsCount = await CatalogDocument.count({ where: { source_id: source.id } });
    console.log(`Documentos no banco: ${docsCount}`);

    console.log('Enfileirando documentos para indexação...');
    const result = await catalogIndexService.queueSourceDocuments(source.id, {
      limit: 10,
      onlyPending: false,
      resetErrored: true,
    });
    console.log(`Enfileirados: ${result.queued}`);

  } catch (err) {
    console.error('Erro:', err.message);
  } finally {
    await sequelize.close();
  }
  process.exit(0);
}

main();