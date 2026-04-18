const { Source, Page, CrawlJob } = require('../models');
const { Op } = require('sequelize');
const { crawlQueue, discoverQueue } = require('../libs/queue');
const { logger } = require('../libs/logger');
const { hashUrl } = require('../libs/url-utils');

class SourceService {
  /**
   * Create a new source
   */
  async create(data) {
    const source = await Source.create({
      name: data.name,
      base_url: data.url || data.baseUrl || data.base_url,
      type: data.type || 'website',
      category: data.category || 'general',
      is_active: data.is_active !== false,
      crawl_depth: data.crawl_depth || data.crawlDepth || data.maxPages || 3,
      follow_internal_links: data.follow_internal_links !== false,
      download_images: data.download_images === true,
      take_screenshots: data.take_screenshots === true,
      delay_between_requests: data.delay_between_requests || 1000,
      user_agent: data.user_agent || null,
      schedule: data.schedule || null,
      state: data.state || null,
      city: data.city || null,
      config_json: data.config || data.configJson || {},
    });

    logger.info(`Source created: ${source.name} (${source.id})`);
    return source;
  }

  /**
   * Update a source
   */
  async update(id, data) {
    const source = await Source.findByPk(id);
    if (!source) {
      throw new Error('Source not found');
    }

    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.url !== undefined || data.baseUrl !== undefined || data.base_url !== undefined) {
      updateData.base_url = data.url || data.baseUrl || data.base_url;
    }
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.status !== undefined) updateData.is_active = data.status !== 'inactive';
    if (data.crawlDepth !== undefined || data.maxPages !== undefined) {
      updateData.crawl_depth = data.crawlDepth || data.maxPages;
    }
    if (data.followInternalLinks !== undefined) updateData.follow_internal_links = data.followInternalLinks;
    if (data.downloadImages !== undefined) updateData.download_images = data.downloadImages;
    if (data.takeScreenshots !== undefined) updateData.take_screenshots = data.takeScreenshots;
    if (data.delayBetweenRequests !== undefined) updateData.delay_between_requests = data.delayBetweenRequests;
    if (data.userAgent !== undefined) updateData.user_agent = data.userAgent;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.state !== undefined) updateData.state = data.state || null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.config !== undefined || data.configJson !== undefined) {
      updateData.config_json = data.config || data.configJson;
    }

    await source.update(updateData);

    logger.info(`Source updated: ${source.name}`);
    return source;
  }

  /**
   * Delete a source
   */
  async delete(id) {
    const source = await Source.findByPk(id);
    if (!source) {
      throw new Error('Source not found');
    }

    await source.destroy();
    logger.info(`Source deleted: ${source.name}`);
    return true;
  }

  /**
   * Get source by ID
   */
  async getById(id) {
    const source = await Source.findByPk(id, {
      include: [
        {
          model: Page,
          as: 'pages',
          limit: 10,
          order: [['last_crawled_at', 'DESC']],
        },
      ],
    });
    return source;
  }

  /**
   * List sources with pagination
   */
  async list(options = {}) {
    const { page = 1, limit = 20, status, category, search } = options;

    const where = {};
    if (status !== undefined) {
      where.is_active = status === 'active';
    }
    if (category) where.category = category;
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { base_url: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Source.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['created_at', 'DESC']],
    });

    return {
      total: count,
      page,
      pages: Math.ceil(count / limit),
      data: rows,
    };
  }

  /**
   * Start a crawl for a source
   */
  async startCrawl(sourceId, options = {}) {
    const source = await Source.findByPk(sourceId);
    if (!source) {
      throw new Error('Source not found');
    }

    const { discover = true, maxPages = source.crawl_depth * 50 } = options;

    // Create a crawl job
    const job = await CrawlJob.create({
      source_id: sourceId,
      type: discover ? 'discovery' : 'incremental',
      status: 'pending',
      total_pages: 0,
      processed_pages: 0,
      config: { maxPages },
    });

    if (discover) {
      // Queue discovery job
      await discoverQueue.add(
        'discover-source',
        {
          sourceId: source.id,
          startUrl: source.base_url,
          maxPages,
          jobId: job.id,
        },
        { jobId: `discover-${source.id}-${Date.now()}` }
      );
    } else {
      // Get existing pages and queue for crawl
      const pages = await Page.findAll({
        where: { source_id: sourceId },
        limit: maxPages,
      });
      const runToken = Date.now();

      await job.update({ total_pages: pages.length, status: 'running', started_at: new Date() });

      for (const page of pages) {
        await crawlQueue.add(
          'crawl-page',
          { pageId: page.id, url: page.url, sourceId: source.id, crawlJobId: job.id },
          { jobId: `crawl-${page.id}-${runToken}` }
        );
      }
    }

    await source.update({ last_crawled_at: new Date() });
    logger.info(`Crawl started for source ${source.name}`);

    return job;
  }

  /**
   * Get crawl status
   */
  async getCrawlStatus(sourceId) {
    const jobs = await CrawlJob.findAll({
      where: { source_id: sourceId },
      order: [['created_at', 'DESC']],
      limit: 5,
    });
    return jobs;
  }

  /**
   * Get source statistics
   */
  async getStats(sourceId) {
    const source = await Source.findByPk(sourceId);
    if (!source) {
      throw new Error('Source not found');
    }

    const totalPages = await Page.count({ where: { source_id: sourceId } });
    const indexedPages = await Page.count({
      where: { source_id: sourceId, last_indexed_at: { [Op.ne]: null } },
    });
    const pendingPages = await Page.count({
      where: { source_id: sourceId, last_indexed_at: null },
    });
    const failedPages = await Page.count({
      where: { source_id: sourceId, has_error: true },
    });

    return {
      source: source.name,
      totalPages,
      indexedPages,
      pendingPages,
      failedPages,
      crawlRate: totalPages > 0 ? ((indexedPages / totalPages) * 100).toFixed(2) + '%' : '0%',
    };
  }
}

module.exports = new SourceService();
