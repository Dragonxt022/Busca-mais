// Load environment variables first
require('dotenv').config();

const { logger } = require('../libs/logger');
const { sequelize } = require('../models');
const config = require('../config');
const CrawlWorker = require('./crawl.worker');
const scheduler = require('../libs/scheduler');

async function startWorker() {
  try {
    await sequelize.authenticate();
    logger.info('Worker: Database connection established');

    const worker = new CrawlWorker();
    
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down worker...');
      await worker.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down worker...');
      await worker.stop();
      process.exit(0);
    });

    await worker.start();
    await scheduler.start();
    logger.info('Worker started successfully with scheduler');
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();