const { Worker } = require('bullmq');
const { redisConfig } = require('../config/redis');
const { logger } = require('../libs/logger');
const Crawler = require('../libs/crawler');
const indexer = require('../libs/indexer');
const { Page, Source, CrawlJob, CatalogDocument, CatalogSource } = require('../models');
const { crawlQueue, indexQueue, discoverQueue, QUEUE_NAMES } = require('../libs/queue');
const catalogDocumentContentService = require('../modules/transparency/services/catalog-document-content.service');

class CrawlWorker {
  constructor() {
    this.crawler = new Crawler();
    this.crawlWorker = null;
    this.indexWorker = null;
    this.discoverWorker = null;
  }

  async start() {
    await this.startCrawlWorker();
    await this.startIndexWorker();
    await this.startDiscoverWorker();
    logger.info('All workers started');
  }

  async startCrawlWorker() {
    this.crawlWorker = new Worker(
      QUEUE_NAMES.CRAWL,
      async (job) => {
        const { pageId, url, sourceId, crawlJobId } = job.data;
        logger.info(`Processing crawl job ${job.id}: ${url}`);

        try {
          const source = await Source.findByPk(sourceId);
          const downloadImages = source ? await source.shouldDownloadImages() : false;
          const parserConfig = {
            contentSelector: source?.config_json?.contentSelector || '',
            excludeSelectors: Array.isArray(source?.config_json?.excludeSelectors)
              ? source.config_json.excludeSelectors
              : [],
          };

          const result = await this.crawler.crawlPage(url, {
            extractLinks: false,
            downloadImages,
            parserConfig,
          });

          if (!result.success) {
            if (crawlJobId) {
              const crawlJob = await CrawlJob.findByPk(crawlJobId).catch(() => null);
              if (crawlJob) {
                const totalPages = Number(crawlJob.pages_found || 0);
                const newCrawled = Number(crawlJob.pages_crawled || 0) + 1;
                const newErrored = Number(crawlJob.pages_errored || 0) + 1;
                const isComplete = totalPages > 0 ? newCrawled >= totalPages : false;

                await crawlJob.update({
                  pages_crawled: newCrawled,
                  pages_errored: newErrored,
                  status: isComplete ? 'failed' : 'running',
                  finished_at: isComplete ? new Date() : null,
                  error_message: result.error,
                }).catch(() => {});
              }
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
            images: downloadImages ? (result.processedImages || null) : null,
            language: result.language,
            metadata_json: {
              ...(result.metadata || {}),
              clean_text: result.contentText || '',
              content_blocks: Array.isArray(result.contentBlocks) ? result.contentBlocks : [],
              has_content: Boolean(result.hasContent),
            },
            has_error: false,
            error_message: null,
          };

          await Page.update(updateData, { where: { id: pageId } });

          // Update job progress
          if (crawlJobId) {
            const crawlJob = await CrawlJob.findByPk(crawlJobId);
            if (crawlJob) {
              const totalPages = Number(crawlJob.pages_found || 0);
              const newCrawled = Number(crawlJob.pages_crawled || 0) + 1;
              const newSaved = Number(crawlJob.pages_saved || 0) + 1;
              const isComplete = totalPages > 0 ? newCrawled >= totalPages : false;
              
              await crawlJob.update({
                pages_crawled: newCrawled,
                pages_saved: newSaved,
                status: isComplete ? 'completed' : 'running',
                finished_at: isComplete ? new Date() : null,
              });
            }
          }

          await indexQueue.add('index-page', { pageId }, { jobId: `index-${pageId}-${Date.now()}` });

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

  async startIndexWorker() {
    this.indexWorker = new Worker(
      QUEUE_NAMES.INDEX,
      async (job) => {
        const { pageId, catalogDocumentId } = job.data;
        logger.info(`Processing index job ${job.id}`);

        try {
          if (catalogDocumentId) {
            const catalogDocument = await CatalogDocument.findByPk(catalogDocumentId, {
              include: [{ model: CatalogSource, as: 'source' }],
            });

            if (!catalogDocument) {
              throw new Error(`Catalog document ${catalogDocumentId} not found`);
            }

            const currentMetadata = catalogDocument.metadata_json || {};

            if (catalogDocument.download_url) {
              try {
                const extractedContent = await catalogDocumentContentService.extractFromDocumentUrl(catalogDocument.download_url);

                await catalogDocument.update({
                  extension: String(catalogDocument.extension || extractedContent.type || '').toUpperCase() || catalogDocument.extension,
                  metadata_json: {
                    ...currentMetadata,
                    extracted_at: new Date().toISOString(),
                    extracted_format: extractedContent.type,
                    extracted_markdown: extractedContent.markdown,
                    extracted_blocks: extractedContent.blocks,
                    has_content: extractedContent.hasContent,
                    extracted_pages: extractedContent.numpages,
                    extracted_text: extractedContent.text,
                    extracted_text_length: extractedContent.textLength,
                    extraction_info: extractedContent.info,
                    last_extraction_error: null,
                    last_index_error: null,
                  },
                });
              } catch (error) {
                logger.warn(`Falha ao extrair texto do documento ${catalogDocumentId}: ${error.message}`);
                await catalogDocument.update({
                  metadata_json: {
                    ...currentMetadata,
                    extracted_at: new Date().toISOString(),
                    last_extraction_error: error.message,
                  },
                });
              }
            }

            await catalogDocument.reload({
              include: [{ model: CatalogSource, as: 'source' }],
            });

            const indexed = await indexer.indexCatalogDocument(catalogDocument);
            if (!indexed) {
              throw new Error('Catalog indexing failed');
            }

            const updatedMetadata = (await CatalogDocument.findByPk(catalogDocumentId)).metadata_json || currentMetadata;
            await catalogDocument.update({
              status: 'indexed',
              metadata_json: {
                ...updatedMetadata,
                indexed_at: new Date().toISOString(),
                last_index_error: null,
              },
            });

            logger.info(`Catalog index completed for document ${catalogDocumentId}`);
            return indexed;
          }

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

          await page.update({ last_indexed_at: new Date() });

          logger.info(`Index completed for page ${pageId}`);
          return result;
        } catch (error) {
          if (catalogDocumentId) {
            const catalogDocument = await CatalogDocument.findByPk(catalogDocumentId).catch(() => null);
            if (catalogDocument) {
              await catalogDocument.update({
                status: 'error',
                metadata_json: {
                  ...(catalogDocument.metadata_json || {}),
                  last_index_error: error.message,
                },
              }).catch(() => {});
            }
          }

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

  async startDiscoverWorker() {
    this.discoverWorker = new Worker(
      QUEUE_NAMES.DISCOVER,
      async (job) => {
        const { sourceId, startUrl, maxPages = 50, maxDepth = 1, maxPaginationPages = 50, jobId } = job.data;
        logger.info(`Processing discover job ${job.id}: source ${sourceId}`);

        try {
          if (jobId) {
            await CrawlJob.update(
              { status: 'running', started_at: new Date() },
              { where: { id: jobId } }
            );
          }

          const source = await Source.findByPk(sourceId);
          if (!source) {
            throw new Error(`Source ${sourceId} not found`);
          }

          const links = await this.crawler.discoverLinks(startUrl, {
            maxLinks: maxPages,
            maxDepth,
            maxPaginationPages: source.config_json?.paginationEnabled === false ? 0 : maxPaginationPages,
            followInternalLinks: source.follow_internal_links !== false,
            sameDomain: true,
            delay: Number(source.delay_between_requests || 0),
          });

          logger.info(`Discovered ${links.length} links from ${startUrl}`);

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
              newCount += 1;
              await crawlQueue.add(
                'crawl-page',
                { pageId: page.id, url: page.url, sourceId },
                { jobId: `crawl-${page.id}` }
              );
            }
          }

          await Source.update(
            { last_crawled_at: new Date() },
            { where: { id: sourceId } }
          );

          if (jobId) {
            await CrawlJob.update(
              { 
                status: 'completed', 
                finished_at: new Date(),
                pages_found: links.length,
                result_json: { discovered: links.length, created: newCount, maxDepth },
              },
              { where: { id: jobId } }
            );
          }

          logger.info(`Discover completed: ${newCount} new pages found`);
          return { discovered: links.length, new: newCount };
        } catch (error) {
          if (jobId) {
            await CrawlJob.update(
              { status: 'failed', finished_at: new Date(), error_message: error.message },
              { where: { id: jobId } }
            );
          }
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

  async stop() {
    if (this.crawlWorker) await this.crawlWorker.close();
    if (this.indexWorker) await this.indexWorker.close();
    if (this.discoverWorker) await this.discoverWorker.close();
    await this.crawler.close();
    logger.info('All workers stopped');
  }
}

module.exports = CrawlWorker;
