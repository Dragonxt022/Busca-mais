require('dotenv').config();

const { typesense, ensureCollection } = require('../config/typesense');

async function initTypesense() {
  try {
    console.log('Initializing Typesense collection...');
    await ensureCollection();
    console.log('Typesense collection ready');
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize Typesense:', error.message);
    process.exit(1);
  }
}

initTypesense();