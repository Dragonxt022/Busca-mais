require('dotenv').config();
const { sequelize } = require('./src/models');

async function main() {
  try {
    console.log('Removendo FK pagina_origem...');
    await sequelize.query('ALTER TABLE "catalog_documents" DROP CONSTRAINT IF EXISTS "catalog_documents_pagina_origem_fkey"');
    console.log('FK removida com sucesso!');
  } catch (err) {
    console.error('Erro:', err.message);
  } finally {
    await sequelize.close();
  }
  process.exit(0);
}

main();