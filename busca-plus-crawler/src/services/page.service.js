const { Page, Source } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { crawlQueue, indexQueue } = require('../libs/queue');
const { logger } = require('../libs/logger');
const { hashUrl } = require('../libs/url-utils');
const indexer = require('../libs/indexer');

class PageService {
  /**
   * Create a new page
   */
  async create(data) {
    const urlHash = hashUrl(data.url);
    
    const page = await Page.create({
      url: data.url,
      url_hash: urlHash,
      source_id: data.sourceId,
      status: 'pending',
    });

    logger.info(`Page created: ${page.url}`);
    return page;
  }

  /**
   * Update a page
   */
  async update(id, data) {
    const page = await Page.findByPk(id);
    if (!page) {
      throw new Error('Page not found');
    }

    await page.update(data);
    logger.info(`Page updated: ${page.url}`);
    return page;
  }

  /**
   * Delete a page
   */
  async delete(id) {
    const page = await Page.findByPk(id);
    if (!page) {
      throw new Error('Page not found');
    }

    // Remove from index
    await indexer.deletePage(id);

    await page.destroy();
    logger.info(`Page deleted: ${page.url}`);
    return true;
  }

  /**
   * Get page by ID
   */
  async getById(id) {
    const page = await Page.findByPk(id, {
      include: [{ model: Source, as: 'source' }],
    });
    return page;
  }

  /**
   * List pages with pagination
   */
  async list(options = {}) {
    const { page = 1, limit = 20, sourceId, status, search } = options;

    const where = {};
    if (sourceId) where.source_id = sourceId;
    if (status) where.last_crawl_status = status;
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { url: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Page.findAndCountAll({
      where,
      include: [{ model: Source, as: 'source', attributes: ['id', 'name', 'category'] }],
      limit,
      offset: (page - 1) * limit,
      order: [['last_crawled_at', 'DESC']],
    });

    return {
      total: count,
      page,
      pages: Math.ceil(count / limit),
      data: rows,
    };
  }

  /**
   * Queue a page for crawling
   */
  async queueForCrawl(pageId) {
    const page = await Page.findByPk(pageId);
    if (!page) {
      throw new Error('Page not found');
    }

    await crawlQueue.add(
      'crawl-page',
      { pageId: page.id, url: page.url, sourceId: page.source_id },
      { jobId: `crawl-${page.id}-${Date.now()}` }
    );

    await page.update({ status: 'queued' });
    logger.info(`Page queued for crawl: ${page.url}`);
    return page;
  }

  /**
   * Queue multiple pages for crawling
   */
  async queuePagesForCrawl(pageIds) {
    const results = [];
    for (const id of pageIds) {
      try {
        const page = await this.queueForCrawl(id);
        results.push({ id, status: 'queued' });
      } catch (error) {
        results.push({ id, status: 'error', error: error.message });
      }
    }
    return results;
  }

  /**
   * Reindex a page
   */
  async reindex(pageId) {
    const page = await Page.findByPk(pageId, {
      include: [{ model: Source, as: 'source' }],
    });
    if (!page) {
      throw new Error('Page not found');
    }

    const result = await indexer.indexPage(page);
    if (result) {
      logger.info(`Page reindexed: ${page.url}`);
    }
    return result;
  }

  /**
   * Get page statistics
   */
  async getStats(sourceId = null) {
    const where = sourceId ? { source_id: sourceId } : {};

    const totalPages = await Page.count({ where });
    const crawledPages = await Page.count({ where: { ...where, last_crawl_status: 'success' } });
    const failedPages = await Page.count({ where: { ...where, last_crawl_status: 'failed' } });
    const pendingPages = await Page.count({ where: { ...where, last_crawl_status: null } });

    // Average response time
    const avgResponseTime = await Page.findOne({
      where,
      attributes: [[sequelize.fn('AVG', sequelize.col('response_time_ms')), 'avg']],
    });

    // Total word count
    const totalWords = await Page.findOne({
      where,
      attributes: [[sequelize.fn('SUM', sequelize.col('word_count')), 'total']],
    });

    return {
      totalPages,
      crawledPages,
      failedPages,
      pendingPages,
      successRate: totalPages > 0 ? ((crawledPages / totalPages) * 100).toFixed(2) + '%' : '0%',
      avgResponseTime: Math.round(avgResponseTime?.dataValues?.avg || 0),
      totalWords: totalWords?.dataValues?.total || 0,
    };
  }

  /**
   * Bulk create pages from URLs
   */
  async bulkCreateFromUrls(urls, sourceId) {
    const results = { created: 0, existing: 0, errors: [] };

    for (const url of urls) {
      try {
        const urlHash = hashUrl(url);
        const [page, created] = await Page.findOrCreate({
          where: { url_hash: urlHash },
          defaults: {
            url,
            source_id: sourceId,
            status: 'pending',
          },
        });

        if (created) {
          results.created++;
        } else {
          results.existing++;
        }
      } catch (error) {
        results.errors.push({ url, error: error.message });
      }
    }

    logger.info(`Bulk create: ${results.created} created, ${results.existing} existing`);
    return results;
  }
}

module.exports = new PageService();
