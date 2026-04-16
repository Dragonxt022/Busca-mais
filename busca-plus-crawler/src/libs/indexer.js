const { typesense, COLLECTION_NAME, ensureCollection } = require('../config/typesense');
const { logger } = require('./logger');
const { extractDomain } = require('./url-utils');
const config = require('../config');

class Indexer {
  constructor() {
    this.initialized = false;
    this.crawlerUrl = process.env.CRAWLER_API_URL || `http://localhost:${process.env.PORT || 3001}`;
  }

  /**
   * Initialize the indexer and ensure collection exists
   */
  async init() {
    if (!this.initialized) {
      await ensureCollection();
      this.initialized = true;
      logger.info('Indexer initialized');
    }
  }

  getScreenshotUrl(screenshotPath) {
    if (!screenshotPath) return '';
    if (screenshotPath.startsWith('http')) return screenshotPath;
    const filename = screenshotPath.split('/').pop();
    return `${this.crawlerUrl}/screenshots/${filename}`;
  }

  getImageUrl(imagePath) {
    if (!imagePath) return '';
    if (imagePath.startsWith('http')) return imagePath;
    const filename = imagePath.split('/').pop();
    return `${this.crawlerUrl}/images/${filename}`;
  }

  /**
   * Parse images JSON and return formatted arrays for indexing
   * @param {string|Object[]} imagesData - Images data
   * @returns {Object} Formatted image arrays
   */
  parseImagesForIndex(imagesData) {
    if (!imagesData) return { images: [], image_alts: [], image_thumbnails: [], has_images: false };
    
    let images = [];
    try {
      images = typeof imagesData === 'string' ? JSON.parse(imagesData) : imagesData;
    } catch {
      return { images: [], image_alts: [], image_thumbnails: [], has_images: false };
    }

    if (!Array.isArray(images) || images.length === 0) {
      return { images: [], image_alts: [], image_thumbnails: [], has_images: false };
    }

    return {
      images: images.map(img => this.getImageUrl(img.localPath || img.originalUrl)).filter(Boolean),
      image_alts: images.map(img => img.alt || '').filter(Boolean),
      image_thumbnails: images.map(img => this.getImageUrl(img.thumbnailPath)).filter(Boolean),
      has_images: true,
    };
  }

  /**
   * Index a single page
   * @param {Object} page - Page data from database
   * @returns {boolean} Success status
   */
  async indexPage(page) {
    try {
      await this.init();

      const imageData = this.parseImagesForIndex(page.images);

      const document = {
        id: String(page.id),
        title: page.title || '',
        description: page.description || '',
        content: page.content_text || '',
        url: page.url,
        slug: page.slug || '',
        domain: extractDomain(page.url),
        category: page.source?.category || '',
        source_id: page.source_id,
        images: imageData.images,
        image_alts: imageData.image_alts,
        image_thumbnails: imageData.image_thumbnails,
        has_images: imageData.has_images,
        language: page.language || 'pt',
        crawled_at: page.last_crawled_at ? new Date(page.last_crawled_at).getTime() : Date.now(),
        relevance_score: this.calculateRelevanceScore(page),
      };

      await typesense.collections(COLLECTION_NAME).documents().upsert(document);
      logger.debug(`Indexed page: ${page.url}`);
      return true;
    } catch (error) {
      logger.error(`Error indexing page ${page.url}:`, error.message);
      return false;
    }
  }

  /**
   * Index multiple pages
   * @param {Object[]} pages - Array of page data
   * @returns {Object} Results summary
   */
  async indexPages(pages) {
    await this.init();

    const results = {
      total: pages.length,
      indexed: 0,
      failed: 0,
      errors: [],
    };

    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      const documents = batch.map(page => {
        const imageData = this.parseImagesForIndex(page.images);
        return {
          id: String(page.id),
          title: page.title || '',
          description: page.description || '',
          content: page.content_text || '',
          url: page.url,
          slug: page.slug || '',
          domain: extractDomain(page.url),
          category: page.source?.category || '',
          source_id: page.source_id,
          screenshot_path: this.getScreenshotUrl(page.screenshot_path),
          images: imageData.images,
          image_alts: imageData.image_alts,
          image_thumbnails: imageData.image_thumbnails,
          has_images: imageData.has_images,
          language: page.language || 'pt',
          crawled_at: page.last_crawled_at ? new Date(page.last_crawled_at).getTime() : Date.now(),
          relevance_score: this.calculateRelevanceScore(page),
        };
      });

      try {
        await typesense.collections(COLLECTION_NAME).documents().import(documents);
        results.indexed += batch.length;
      } catch (error) {
        // Try indexing one by one if batch fails
        for (const doc of documents) {
          try {
            await typesense.collections(COLLECTION_NAME).documents().upsert(doc);
            results.indexed++;
          } catch (err) {
            results.failed++;
            results.errors.push({ url: doc.url, error: err.message });
          }
        }
      }
    }

    logger.info(`Indexing complete: ${results.indexed} indexed, ${results.failed} failed`);
    return results;
  }

  /**
   * Remove a page from the index
   * @param {number} pageId - Page ID to remove
   * @returns {boolean} Success status
   */
  async deletePage(pageId) {
    try {
      await typesense.collections(COLLECTION_NAME).documents(String(pageId)).delete();
      logger.debug(`Deleted page from index: ${pageId}`);
      return true;
    } catch (error) {
      if (error.httpStatus === 404) {
        logger.debug(`Page not found in index: ${pageId}`);
        return true;
      }
      logger.error(`Error deleting page ${pageId}:`, error.message);
      return false;
    }
  }

  /**
   * Delete all pages for a source
   * @param {number} sourceId - Source ID
   * @returns {boolean} Success status
   */
  async deletePagesBySource(sourceId) {
    try {
      await typesense.collections(COLLECTION_NAME).documents().delete({
        filter_by: `source_id:${sourceId}`,
      });
      logger.info(`Deleted all pages for source ${sourceId}`);
      return true;
    } catch (error) {
      logger.error(`Error deleting pages for source ${sourceId}:`, error.message);
      return false;
    }
  }

  /**
   * Search for pages
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Object} Search results
   */
  async search(query, options = {}) {
    const {
      page = 1,
      perPage = 10,
      filters = {},
      sortBy = '_text_match:desc,crawled_at:desc',
    } = options;

    try {
      await this.init();

      const searchParams = {
        q: query,
        query_by: 'title,description,content,url',
        page,
        per_page: perPage,
        sort_by: sortBy,
      };

      // Add filters if provided
      if (filters.domain) {
        searchParams.filter_by = `domain:${filters.domain}`;
      }
      if (filters.source_id) {
        searchParams.filter_by = searchParams.filter_by
          ? `${searchParams.filter_by} && source_id:${filters.source_id}`
          : `source_id:${filters.source_id}`;
      }
      if (filters.category) {
        searchParams.filter_by = searchParams.filter_by
          ? `${searchParams.filter_by} && category:${filters.category}`
          : `category:${filters.category}`;
      }

      const result = await typesense.collections(COLLECTION_NAME).documents().search(searchParams);

      return {
        success: true,
        query,
        page,
        perPage,
        total: result.found,
        pages: result.out_of,
        hits: result.hits?.map(hit => ({
          id: parseInt(hit.document.id),
          title: hit.document.title,
          description: hit.document.description,
          url: hit.document.url,
          slug: hit.document.slug,
          domain: hit.document.domain,
          category: hit.document.category,
          source_id: hit.document.source_id,
          screenshot_path: hit.document.screenshot_path,
          images: hit.document.images || [],
          image_alts: hit.document.image_alts || [],
          image_thumbnails: hit.document.image_thumbnails || [],
          has_images: hit.document.has_images || false,
          language: hit.document.language,
          crawled_at: hit.document.crawled_at,
          relevance_score: hit.document.relevance_score,
          highlight: hit.highlight,
        })) || [],
      };
    } catch (error) {
      logger.error(`Search error for "${query}":`, error.message);
      return {
        success: false,
        query,
        page,
        perPage,
        total: 0,
        pages: 0,
        hits: [],
        error: error.message,
      };
    }
  }

  /**
   * Calculate relevance score for a page
   * @param {Object} page - Page data
   * @returns {number} Relevance score
   */
  calculateRelevanceScore(page) {
    let score = 0;

    // Title presence
    if (page.title) score += 10;

    // Description presence
    if (page.description) score += 5;

    // Content length bonus
    if (page.word_count) {
      if (page.word_count > 500) score += 10;
      else if (page.word_count > 200) score += 5;
      else if (page.word_count > 100) score += 2;
    }

    // Recency bonus
    if (page.last_crawled_at) {
      const daysSinceCrawl = (Date.now() - new Date(page.last_crawled_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCrawl < 7) score += 10;
      else if (daysSinceCrawl < 30) score += 5;
      else if (daysSinceCrawl < 90) score += 2;
    }

    return Math.min(score, 100);
  }

  /**
   * Search for images (pages with images)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Object} Search results with image focus
   */
  async searchImages(query, options = {}) {
    const {
      page = 1,
      perPage = 20,
      filters = {},
    } = options;

    try {
      await this.init();

      const searchParams = {
        q: query,
        query_by: 'title,description,image_alts,content',
        page,
        per_page: perPage,
        sort_by: '_text_match:desc,crawled_at:desc',
        filter_by: 'has_images:true',
      };

      // Add additional filters
      if (filters.domain) {
        searchParams.filter_by = `${searchParams.filter_by} && domain:${filters.domain}`;
      }
      if (filters.category) {
        searchParams.filter_by = `${searchParams.filter_by} && category:${filters.category}`;
      }

      const result = await typesense.collections(COLLECTION_NAME).documents().search(searchParams);

      // Transform results to focus on images
      const imageResults = [];
      for (const hit of result.hits || []) {
        const doc = hit.document;
        const thumbnails = doc.image_thumbnails || [];
        const alts = doc.image_alts || [];
        const images = doc.images || [];

        for (let i = 0; i < thumbnails.length; i++) {
          imageResults.push({
            id: parseInt(doc.id),
            title: doc.title,
            description: doc.description,
            url: doc.url,
            domain: doc.domain,
            thumbnail: thumbnails[i] || images[i],
            alt: alts[i] || doc.title,
            relevance_score: doc.relevance_score,
          });
        }
      }

      return {
        success: true,
        query,
        page,
        perPage,
        total: result.found,
        images: imageResults.slice(0, perPage),
      };
    } catch (error) {
      logger.error(`Image search error for "${query}":`, error.message);
      return {
        success: false,
        query,
        page,
        perPage,
        total: 0,
        images: [],
        error: error.message,
      };
    }
  }

  /**
   * Get collection statistics
   * @returns {Object} Collection stats
   */
  async getStats() {
    try {
      const collection = await typesense.collections(COLLECTION_NAME).retrieve();
      return {
        name: collection.name,
        documentCount: collection.num_documents,
        fieldCount: collection.fields.length,
        createdAt: collection.created_at,
      };
    } catch (error) {
      logger.error('Error getting collection stats:', error.message);
      return null;
    }
  }
}

module.exports = new Indexer();