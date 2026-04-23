const { Worker, Queue } = require('bullmq');
const { redisConfig } = require('../config/redis');
const { logger } = require('../libs/logger');
const PipelineRunner = require('../modules/engine/pipeline-runner');
const contentIndexer = require('../modules/engine/content-indexer');
const ContentItem = require('../modules/engine/models/content-item.model');
const SearchableSource = require('../modules/engine/models/searchable-source.model');
const aiSettingsService = require('../services/ai-settings.service');
const aiRetrievalService = require('../modules/ai/ai-retrieval.service');

const PIPELINE_QUEUE = 'pipeline';
const PIPELINE_INDEX_QUEUE = 'pipeline_index';
const PIPELINE_EMBED_QUEUE = 'pipeline_embed';

const pipelineQueue = new Queue(PIPELINE_QUEUE, {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const pipelineIndexQueue = new Queue(PIPELINE_INDEX_QUEUE, {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

const pipelineEmbedQueue = new Queue(PIPELINE_EMBED_QUEUE, {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 100,
  },
});

class PipelineWorkerManager {
  constructor() {
    this.runner = new PipelineRunner();
    this.crawlWorker = null;
    this.indexWorker = null;
    this.embedWorker = null;
  }

  async start() {
    this._startCrawlWorker();
    this._startIndexWorker();
    this._startEmbedWorker();
    logger.info('[PipelineWorker] Workers iniciados');
  }

  _startCrawlWorker() {
    this.crawlWorker = new Worker(
      PIPELINE_QUEUE,
      async (job) => {
        const { type, sourceId, url, runId } = job.data;

        if (type === 'run_source') {
          return this._handleRunSource(sourceId, job.data.runType || 'full');
        }

        if (type === 'process_url') {
          return this._handleProcessUrl(url, sourceId, runId);
        }

        throw new Error(`Tipo de job desconhecido: ${type}`);
      },
      {
        connection: redisConfig,
        concurrency: 2,
        limiter: { max: 10, duration: 60000 },
      }
    );

    this.crawlWorker.on('failed', (job, err) => {
      logger.error(`[PipelineWorker] Job ${job?.id} falhou: ${err.message}`);
    });
  }

  _startIndexWorker() {
    this.indexWorker = new Worker(
      PIPELINE_INDEX_QUEUE,
      async (job) => {
        const { itemId } = job.data;
        return this._handleIndexItem(itemId);
      },
      {
        connection: redisConfig,
        concurrency: 5,
        limiter: { max: 30, duration: 60000 },
      }
    );

    this.indexWorker.on('failed', (job, err) => {
      logger.error(`[PipelineIndexWorker] Job ${job?.id} falhou: ${err.message}`);
    });
  }

  _startEmbedWorker() {
    this.embedWorker = new Worker(
      PIPELINE_EMBED_QUEUE,
      async (job) => {
        const { itemId } = job.data;
        return this._handleEmbedItem(itemId);
      },
      {
        connection: redisConfig,
        concurrency: 1,
        limiter: { max: 5, duration: 60000 },
      }
    );

    this.embedWorker.on('failed', (job, err) => {
      logger.error(`[PipelineEmbedWorker] Job ${job?.id} falhou: ${err.message}`);
    });
  }

  async _handleRunSource(sourceId, runType) {
    logger.info(`[PipelineWorker] Iniciando run completo da fonte ${sourceId}`);
    const run = await this.runner.runSource(sourceId, runType);

    let totalQueued = 0;
    let offset = 0;
    const batchSize = 500;

    while (true) {
      const batch = await ContentItem.findAll({
        where: { source_id: sourceId, status: 'pending' },
        attributes: ['id'],
        order: [['id', 'ASC']],
        limit: batchSize,
        offset,
      });

      if (!batch.length) break;

      for (const item of batch) {
        await pipelineIndexQueue.add('index_item', { itemId: item.id }, { priority: 2 });
      }

      totalQueued += batch.length;
      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    logger.info(`[PipelineWorker] ${totalQueued} itens enfileirados para indexacao`);
    return { runId: run.id, pendingIndexed: totalQueued };
  }

  async _handleProcessUrl(url, sourceId, runId) {
    const source = await SearchableSource.findByPk(sourceId);
    if (!source) throw new Error(`SearchableSource ${sourceId} nao encontrada`);

    const run = runId ? { id: runId } : null;
    const { items } = await this.runner.processUrl(url, source, run);

    for (const item of items) {
      await pipelineIndexQueue.add('index_item', { itemId: item.id }, { priority: 3 });
    }

    return { processed: items.length };
  }

  async _handleIndexItem(itemId) {
    const item = await ContentItem.findByPk(itemId);
    if (!item) {
      logger.warn(`[PipelineIndexWorker] Item ${itemId} nao encontrado`);
      return;
    }

    const source = await SearchableSource.findByPk(item.source_id);
    const success = await contentIndexer.indexItem(item, source);

    if (success) {
      logger.debug(`[PipelineIndexWorker] ci-${itemId} indexado`);

      const settings = aiSettingsService.getSettings();
      if (settings.enabled && settings.features?.embeddings) {
        await pipelineEmbedQueue.add('embed_item', { itemId }, { priority: 5 });
      }
    }
  }

  async _handleEmbedItem(itemId) {
    const settings = aiSettingsService.getSettings();
    if (!settings.enabled || !settings.features?.embeddings) return;

    try {
      const result = await aiRetrievalService.processItem(itemId);
      logger.debug(`[PipelineEmbedWorker] ci-${itemId}: ${result.embedded} embeddings gerados`);
    } catch (error) {
      logger.warn(`[PipelineEmbedWorker] ci-${itemId} falhou: ${error.message}`);
      throw error;
    }
  }

  async stop() {
    if (this.crawlWorker) await this.crawlWorker.close();
    if (this.indexWorker) await this.indexWorker.close();
    if (this.embedWorker) await this.embedWorker.close();
    logger.info('[PipelineWorker] Workers encerrados');
  }
}

const manager = new PipelineWorkerManager();

module.exports = {
  manager,
  pipelineQueue,
  pipelineIndexQueue,
  pipelineEmbedQueue,
};
