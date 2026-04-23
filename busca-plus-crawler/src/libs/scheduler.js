const { logger } = require('./logger');
const { discoverQueue, crawlQueue, QUEUE_NAMES } = require('./queue');
const { Source, Page, SearchableSource } = require('../models');
const { pipelineQueue } = require('../workers/pipeline.worker');
const { Op } = require('sequelize');

class CrawlScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.scheduledEngineJobs = new Map();
  }

  async start() {
    logger.info('Starting crawl scheduler...');
    await this.syncScheduledJobs();
    setInterval(() => this.syncScheduledJobs(), 60000);
  }

  async syncScheduledJobs() {
    try {
      const sources = await Source.findAll({
        where: {
          is_active: true,
          schedule: {
            [Op.ne]: null,
          },
        },
      });

      const currentKeys = new Set(sources.map(s => `source-${s.id}`));

      for (const [key, jobKey] of this.scheduledJobs) {
        if (!currentKeys.has(key)) {
          await this.removeScheduledJob(key);
        }
      }

      for (const source of sources) {
        await this.scheduleSource(source);
      }

      await this.syncEngineScheduledJobs();

      logger.info(`Scheduler synced: ${sources.length} scheduled sources`);
    } catch (error) {
      logger.error('Scheduler sync error:', error.message);
    }
  }

  async syncEngineScheduledJobs() {
    const sources = await SearchableSource.findAll({
      where: {
        is_active: true,
        schedule: {
          [Op.ne]: null,
        },
      },
    });

    const currentKeys = new Set(sources.map((source) => `engine-source-${source.id}`));

    for (const key of this.scheduledEngineJobs.keys()) {
      if (!currentKeys.has(key)) {
        await this.removeEngineScheduledJob(key);
      }
    }

    for (const source of sources) {
      await this.scheduleEngineSource(source);
    }

    logger.info(`Engine scheduler synced: ${sources.length} scheduled sources`);
  }

  async scheduleEngineSource(source) {
    const key = `engine-source-${source.id}`;
    const jobKey = `scheduled-engine-${source.id}`;
    const existingJobs = await pipelineQueue.getRepeatableJobs();
    const existingJob = existingJobs.find((job) => job.key.includes(jobKey));

    if (existingJob) {
      if (existingJob.pattern !== source.schedule) {
        await pipelineQueue.removeRepeatableByKey(existingJob.key);
        await this.createEngineRepeatableJob(source, jobKey);
        logger.info(`Updated engine schedule for source ${source.id}: ${source.schedule}`);
      }
    } else {
      await this.createEngineRepeatableJob(source, jobKey);
      logger.info(`Created engine schedule for source ${source.id}: ${source.schedule}`);
    }

    this.scheduledEngineJobs.set(key, jobKey);
  }

  async createEngineRepeatableJob(source, jobKey) {
    await pipelineQueue.add(
      'run_source',
      {
        type: 'run_source',
        sourceId: source.id,
        runType: 'incremental',
      },
      {
        jobId: jobKey,
        repeat: {
          cron: source.schedule,
        },
      }
    );
  }

  async removeEngineScheduledJob(key) {
    const jobKey = this.scheduledEngineJobs.get(key);
    if (!jobKey) return;

    const repeatableJobs = await pipelineQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.key.includes(jobKey)) {
        await pipelineQueue.removeRepeatableByKey(job.key);
      }
    }

    this.scheduledEngineJobs.delete(key);
  }

  async scheduleSource(source) {
    const key = `source-${source.id}`;
    const jobKey = `scheduled-${source.id}`;

    try {
      const existingJobs = await discoverQueue.getRepeatableJobs();
      const existingJob = existingJobs.find(j => j.key.includes(jobKey));

      if (existingJob) {
        if (this.hasScheduleChanged(source, existingJob)) {
          await discoverQueue.removeRepeatableByKey(existingJob.key);
          await this.createRepeatableJob(source, jobKey);
          logger.info(`Updated schedule for source ${source.id}: ${source.schedule}`);
        }
      } else {
        await this.createRepeatableJob(source, jobKey);
        logger.info(`Created schedule for source ${source.id}: ${source.schedule}`);
      }

      this.scheduledJobs.set(key, jobKey);
    } catch (error) {
      logger.error(`Failed to schedule source ${source.id}:`, error.message);
    }
  }

  async createRepeatableJob(source, jobKey) {
    const maxPages = source.max_pages || source.crawl_depth * 50;
    const pages = await Page.findAll({
      where: { source_id: source.id },
      limit: maxPages,
    });

    if (pages.length === 0) {
      await discoverQueue.add(
        'discover-pages',
        {
          sourceId: source.id,
          startUrl: source.base_url,
          maxDepth: source.crawl_depth,
          maxPages,
          maxPaginationPages: source.config_json?.maxPaginationPages || Math.min(maxPages, 50),
        },
        {
          jobId: `discover-${source.id}`,
          repeat: {
            cron: source.schedule,
          },
        }
      );
    } else {
      for (const page of pages) {
        await crawlQueue.add(
          'crawl-page',
          {
            pageId: page.id,
            url: page.url,
            sourceId: source.id,
          },
          {
            jobId: `scheduled-crawl-${page.id}`,
            repeat: {
              cron: source.schedule,
            },
          }
        );
      }
    }
  }

  hasScheduleChanged(source, existingJob) {
    return existingJob.pattern !== source.schedule;
  }

  async removeScheduledJob(key) {
    const jobKey = this.scheduledJobs.get(key);
    if (!jobKey) return;

    try {
      const sourceId = key.replace('source-', '');
      const pages = await Page.findAll({
        attributes: ['id'],
        where: { source_id: sourceId },
      });
      const repeatableJobs = await discoverQueue.getRepeatableJobs();
      
      for (const job of repeatableJobs) {
        if (job.key.includes(jobKey)) {
          await discoverQueue.removeRepeatableByKey(job.key);
        }
      }

      const crawlJobs = await crawlQueue.getRepeatableJobs();
      for (const job of crawlJobs) {
        if (pages.some((page) => job.key.includes(`scheduled-crawl-${page.id}`))) {
          await crawlQueue.removeRepeatableByKey(job.key);
        }
      }

      this.scheduledJobs.delete(key);
      logger.info(`Removed schedule for source ${sourceId}`);
    } catch (error) {
      logger.error(`Failed to remove scheduled job ${key}:`, error.message);
    }
  }

  async getScheduledSources() {
    const sources = await Source.findAll({
      where: {
        is_active: true,
        schedule: {
          [Op.ne]: null,
        },
      },
    });

    const result = [];
    for (const source of sources) {
      const discoverJobs = await discoverQueue.getRepeatableJobs();
      const discoverJob = discoverJobs.find(j => j.key.includes(`scheduled-${source.id}`));
      
      result.push({
        source,
        nextRun: discoverJob ? new Date(discoverJob.nextMillis) : null,
        repeatJobKey: discoverJob?.key || null,
      });
    }

    return result;
  }

  async removeAllSchedules() {
    for (const key of this.scheduledJobs.keys()) {
      await this.removeScheduledJob(key);
    }
  }
}

module.exports = new CrawlScheduler();
