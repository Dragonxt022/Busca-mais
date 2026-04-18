const { sequelize } = require('./src/config/database');

async function main() {
  try {
    const [results] = await sequelize.query('SELECT id, name FROM "catalog_sources" LIMIT 5');
    console.log('Catalog sources:');
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sequelize.close();
  }
}

main();