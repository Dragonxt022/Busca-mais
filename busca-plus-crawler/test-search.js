require('dotenv').config();
const Typesense = require('typesense');

const client = new Typesense.Client({
  nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
  apiKey: 'xyz',
});

async function main() {
  try {
    const results = await client.collections('pages').documents().search({
      q: 'decreto',
      per_page: 5,
      query_by: 'title,description,content,document_type',
    });
    console.log('Resultados da busca por "decreto":');
    results.hits.forEach(hit => {
      console.log(`- ID: ${hit.document.id || hit.document.url}, Tipo: ${hit.document.document_type || hit.document.category || 'page'}`);
    });
    console.log(`\nTotal encontrado: ${results.found}`);
  } catch (err) {
    console.error('Erro:', err.message);
  }
  process.exit(0);
}

main();