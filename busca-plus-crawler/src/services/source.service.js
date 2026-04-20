const { Source, Page, CrawlJob } = require('../models');
const { Op } = require('sequelize');
const { crawlQueue, discoverQueue } = require('../libs/queue');
const { logger } = require('../libs/logger');
const { hashUrl } = require('../libs/url-utils');

class SourceService {
  normalizePositiveInt(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  normalizeNullablePositiveInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Create a new source
   */
  async create(data) {
    const source = await Source.create({
      name: data.name,
      base_url: data.base_url || data.url || data.baseUrl,
      type: data.type || 'website',
      category: data.category || 'general',
      is_active: data.is_active !== false,
      crawl_depth: this.normalizePositiveInt(data.crawl_depth ?? data.crawlDepth, 3),
      follow_internal_links: data.follow_internal_links !== false,
      download_images: data.download_images === true,
      auto_enable_images_after_pages: data.auto_enable_images_after_pages || data.autoEnableImagesAfterPages || 0,
      take_screenshots: data.take_screenshots === true,
      delay_between_requests: this.normalizePositiveInt(data.delay_between_requests ?? data.delayBetweenRequests, 1000),
      user_agent: data.user_agent || null,
      schedule: data.schedule || null,
      state: data.state || null,
      city: data.city || null,
      max_pages: this.normalizeNullablePositiveInt(data.max_pages ?? data.maxPages),
      config_json: data.config || data.configJson || {},
      result_link_type: ['detail_page', 'direct_document'].includes(data.result_link_type || data.resultLinkType)
        ? (data.result_link_type || data.resultLinkType)
        : 'detail_page',
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
    if (data.is_active !== undefined) updateData.is_active = data.is_active;
    if (data.status !== undefined) updateData.is_active = data.status !== 'inactive';
    if (data.crawl_depth !== undefined) updateData.crawl_depth = this.normalizePositiveInt(data.crawl_depth, source.crawl_depth || 3);
    if (data.crawlDepth !== undefined) {
      updateData.crawl_depth = this.normalizePositiveInt(data.crawlDepth, source.crawl_depth || 3);
    }
    if (data.follow_internal_links !== undefined) updateData.follow_internal_links = data.follow_internal_links;
    if (data.followInternalLinks !== undefined) updateData.follow_internal_links = data.followInternalLinks;
    if (data.download_images !== undefined) updateData.download_images = data.download_images;
    if (data.downloadImages !== undefined) updateData.download_images = data.downloadImages;
    if (updateData.download_images === false) updateData.auto_enable_images_after_pages = 0;
    if (data.auto_enable_images_after_pages !== undefined) {
      updateData.auto_enable_images_after_pages = this.normalizePositiveInt(data.auto_enable_images_after_pages, 0) || 0;
    }
    if (data.autoEnableImagesAfterPages !== undefined) {
      updateData.auto_enable_images_after_pages = this.normalizePositiveInt(data.autoEnableImagesAfterPages, 0) || 0;
    }
    if (data.take_screenshots !== undefined) updateData.take_screenshots = data.take_screenshots;
    if (data.takeScreenshots !== undefined) updateData.take_screenshots = data.takeScreenshots;
    if (data.delay_between_requests !== undefined) updateData.delay_between_requests = this.normalizePositiveInt(data.delay_between_requests, source.delay_between_requests || 1000);
    if (data.delayBetweenRequests !== undefined) updateData.delay_between_requests = this.normalizePositiveInt(data.delayBetweenRequests, source.delay_between_requests || 1000);
    if (data.user_agent !== undefined) updateData.user_agent = data.user_agent;
    if (data.userAgent !== undefined) updateData.user_agent = data.userAgent;
    if (data.schedule !== undefined) updateData.schedule = data.schedule;
    if (data.state !== undefined) updateData.state = data.state || null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.config !== undefined || data.configJson !== undefined) {
      updateData.config_json = data.config || data.configJson;
    }
    if (data.max_pages !== undefined || data.maxPages !== undefined) {
      updateData.max_pages = this.normalizeNullablePositiveInt(data.max_pages ?? data.maxPages);
    }
    const rlType = data.result_link_type || data.resultLinkType;
    if (rlType !== undefined) {
      updateData.result_link_type = ['detail_page', 'direct_document'].includes(rlType) ? rlType : 'detail_page';
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
    const { page = 1, limit = 20, where = {}, status, category, search } = options;
    const finalWhere = { ...where };

    if (status !== undefined) {
      finalWhere.is_active = status === 'active';
    }
    if (category) finalWhere.category = category;
    if (search) {
      finalWhere[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { base_url: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Source.findAndCountAll({
      where: finalWhere,
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

    const discover = options.discover !== undefined ? options.discover : true;
    const maxDepth = this.normalizePositiveInt(options.maxDepth ?? options.crawlDepth ?? source.crawl_depth, source.crawl_depth || 1);
    const maxPages = this.normalizePositiveInt(options.maxPages ?? source.max_pages, maxDepth * 50);
    const maxPaginationPages = this.normalizePositiveInt(
      options.maxPaginationPages ?? source.config_json?.maxPaginationPages,
      Math.min(maxPages, 50)
    );

    // Create a crawl job
    const job = await CrawlJob.create({
      source_id: sourceId,
      type: discover ? 'discovery' : 'incremental',
      status: 'pending',
      payload_json: { discover, maxPages, maxDepth, maxPaginationPages },
      pages_found: 0,
      pages_crawled: 0,
      pages_saved: 0,
      pages_errored: 0,
    });

    if (discover) {
      // Queue discovery job
      await discoverQueue.add(
        'discover-source',
        {
          sourceId: source.id,
          startUrl: source.base_url,
          maxDepth,
          maxPages,
          maxPaginationPages,
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

      await job.update({
        pages_found: pages.length,
        status: 'running',
        started_at: new Date(),
      });

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
      pagesWithErrors: failedPages,
      lastCrawl: source.last_crawled_at,
      crawlRate: totalPages > 0 ? ((indexedPages / totalPages) * 100).toFixed(2) + '%' : '0%',
    };
  }
}

module.exports = new SourceService();
