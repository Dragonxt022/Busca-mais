require('dotenv').config();
const CrawlWorker = require('./src/workers/crawl.worker');

async function main() {
  console.log('Iniciando worker de indexação...');
  const worker = new CrawlWorker();
  await worker.startIndexWorker();
  console.log('Worker iniciado! Processando jobs (aguarde)...');

  setTimeout(async () => {
    console.log('Encerrando...');
    await worker.stop();
    process.exit(0);
  }, 120000);
}

main();