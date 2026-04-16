const { Queue, Worker } = require('bullmq');
const { redis } = require('../config/redis');
const { logger } = require('./logger');

// Queue names
const QUEUE_NAMES = {
  CRAWL: 'crawl',
  INDEX: 'index',
  DISCOVER: 'discover',
};

// Create queues
const crawlQueue = new Queue(QUEUE_NAMES.CRAWL, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const indexQueue = new Queue(QUEUE_NAMES.INDEX, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const discoverQueue = new Queue(QUEUE_NAMES.DISCOVER, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});

module.exports = {
  crawlQueue,
  indexQueue,
  discoverQueue,
  QUEUE_NAMES,
};