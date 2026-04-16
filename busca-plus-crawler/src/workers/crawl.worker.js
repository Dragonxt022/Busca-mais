const { Worker } = require('bullmq');
const { redisConfig } = require('../config/redis');
const { logger } = require('../libs/logger');
const Crawler = require('../libs/crawler');
const indexer = require('../libs/indexer');
const { Page, Source, CrawlJob } = require('../models');
const { crawlQueue, indexQueue, discoverQueue, QUEUE_NAMES } = require('../libs/queue');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

class CrawlWorker {
  constructor() {
    this.crawler = new Crawler();
    this.crawlWorker = null;
    this.indexWorker = null;
    this.discoverWorker = null;
  }

  /**
   * Start all workers
   */
  async start() {
    await this.startCrawlWorker();
    await this.startIndexWorker();
    await this.startDiscoverWorker();
    logger.info('All workers started');
  }

  /**
   * Start the crawl worker
   */
  async startCrawlWorker() {
    this.crawlWorker = new Worker(
      QUEUE_NAMES.CRAWL,
      async (job) => {
        const { pageId, url, sourceId, jobId } = job.data;
        logger.info(`Processing crawl job ${job.id}: ${url}`);

        try {
          const result = await this.crawler.crawlPage(url, {
            extractLinks: false,
          });

          if (!result.success) {
            if (jobId) {
              await CrawlJob.update(
                {
                  status: 'failed',
                  error_message: result.error,
                  completed_at: new Date(),
                },
                { where: { id: jobId } }
              );
            }
            await Page.update(
              {
                has_error: true,
                error_message: result.error,
                last_crawled_at: new Date(),
              },
              { where: { id: pageId } }
            );
            throw new Error(result.error);
          }

          const updateData = {
            title: result.title,
            description: result.description,
            content_text: result.contentText,
            content_html: result.contentHtml,
            word_count: result.wordCount,
            slug: result.slug,
            last_crawled_at: new Date(),
            status_code: result.statusCode,
            response_time_ms: result.responseTimeMs,
            images: result.processedImages || null,
            language: result.language,
            metadata_json: result.metadata,
            has_error: false,
            error_message: null,
          };

          await Page.update(updateData, { where: { id: pageId } });

          if (jobId) {
            await CrawlJob.update(
              {
                status: 'completed',
                completed_at: new Date(),
              },
              { where: { id: jobId } }
            );
          }

          await indexQueue.add('index-page', { pageId }, { jobId: `index-${pageId}` });

          logger.info(`Crawl completed for ${url}`);
          return result;
        } catch (error) {
          logger.error(`Crawl job ${job.id} failed:`, error.message);
          throw error;
        }
      },
      {
        connection: redisConfig,
        concurrency: 2,
        limiter: {
          max: 10,
          duration: 60000,
        },
      }
    );

    this.crawlWorker.on('completed', (job) => {
      logger.debug(`Crawl job ${job.id} completed`);
    });

    this.crawlWorker.on('failed', (job, err) => {
      logger.error(`Crawl job ${job?.id} failed:`, err.message);
    });
  }

  /**
   * Start the index worker
   */
  async startIndexWorker() {
    this.indexWorker = new Worker(
      QUEUE_NAMES.INDEX,
      async (job) => {
        const { pageId } = job.data;
        logger.info(`Processing index job ${job.id}: page ${pageId}`);

        try {
          const page = await Page.findByPk(pageId, {
            include: [{ model: Source, as: 'source' }],
          });

          if (!page) {
            throw new Error(`Page ${pageId} not found`);
          }

          const result = await indexer.indexPage(page);
          if (!result) {
            throw new Error('Indexing failed');
          }

          logger.info(`Index completed for page ${pageId}`);
          return result;
        } catch (error) {
          logger.error(`Index job ${job.id} failed:`, error.message);
          throw error;
        }
      },
      {
        connection: redisConfig,
        concurrency: 5,
      }
    );

    this.indexWorker.on('completed', (job) => {
      logger.debug(`Index job ${job.id} completed`);
    });

    this.indexWorker.on('failed', (job, err) => {
      logger.error(`Index job ${job?.id} failed:`, err.message);
    });
  }

  /**
   * Start the discover worker
   */
  async startDiscoverWorker() {
    this.discoverWorker = new Worker(
      QUEUE_NAMES.DISCOVER,
      async (job) => {
        const { sourceId, startUrl, maxPages = 50 } = job.data;
        logger.info(`Processing discover job ${job.id}: source ${sourceId}`);

        try {
          const source = await Source.findByPk(sourceId);
          if (!source) {
            throw new Error(`Source ${sourceId} not found`);
          }

          // Discover links from the start URL
          const links = await this.crawler.discoverLinks(startUrl, {
            maxLinks: maxPages,
            sameDomain: true,
          });

          logger.info(`Discovered ${links.length} links from ${startUrl}`);

          // Create pages for new URLs
          let newCount = 0;
          for (const link of links) {
            const urlHash = require('crypto').createHash('sha256').update(link).digest('hex');
            const [page, created] = await Page.findOrCreate({
              where: { hash_url: urlHash },
              defaults: {
                url: link,
                source_id: sourceId,
                is_active: true,
              },
            });

            if (created) {
              newCount++;
              // Queue for crawling
              await crawlQueue.add(
                'crawl-page',
                { pageId: page.id, url: page.url, sourceId },
                { jobId: `crawl-${page.id}` }
              );
            }
          }

          // Update source stats
          await Source.update(
            {
              last_crawled_at: new Date(),
            },
            { where: { id: sourceId } }
          );

          logger.info(`Discover completed: ${newCount} new pages found`);
          return { discovered: links.length, new: newCount };
        } catch (error) {
          logger.error(`Discover job ${job.id} failed:`, error.message);
          throw error;
        }
      },
      {
        connection: redisConfig,
        concurrency: 1,
      }
    );

    this.discoverWorker.on('completed', (job) => {
      logger.debug(`Discover job ${job.id} completed`);
    });

    this.discoverWorker.on('failed', (job, err) => {
      logger.error(`Discover job ${job?.id} failed:`, err.message);
    });
  }

  /**
   * Stop all workers
   */
  async stop() {
    if (this.crawlWorker) await this.crawlWorker.close();
    if (this.indexWorker) await this.indexWorker.close();
    if (this.discoverWorker) await this.discoverWorker.close();
    await this.crawler.close();
    logger.info('All workers stopped');
  }
}

module.exports = CrawlWorker;