// Load environment variables first
require('dotenv').config();

const { logger } = require('../libs/logger');
const { sequelize } = require('../models');
const config = require('../config');
const CrawlWorker = require('./crawl.worker');
const { manager: pipelineWorkerManager } = require('./pipeline.worker');
const scheduler = require('../libs/scheduler');
const { ensurePlaywrightChromium } = require('../libs/playwright-utils');

async function startWorker() {
  try {
    ensurePlaywrightChromium();
    await sequelize.authenticate();
    logger.info('Worker: Database connection established');

    const worker = new CrawlWorker();

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down worker...');
      await worker.stop();
      await pipelineWorkerManager.stop();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down worker...');
      await worker.stop();
      await pipelineWorkerManager.stop();
      process.exit(0);
    });

    await worker.start();
    await pipelineWorkerManager.start();
    await scheduler.start();
    logger.info('Worker started successfully with scheduler and pipeline workers');
  } catch (error) {
    logger.error('Failed to start worker:', error);
    process.exit(1);
  }
}

startWorker();
