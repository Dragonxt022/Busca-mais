const axios = require('axios');

const config = require('../../config');
const { typesense, COLLECTION_NAME } = require('../../config/typesense');
const { logger } = require('../../libs/logger');

class SearchService {
  constructor() {
    this.collectionName = COLLECTION_NAME;
    this.crawlerApiUrl = config.crawler.apiUrl;
    this.crawlerExternalUrl = config.crawler.externalUrl;
  }

  async search(query, page = 1, sourceId = null) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents()
        .search(this.buildSearchParams({ query, page, perPage: 10, sourceId }));

      await this.logSearch(query, result.found, sourceId);

      return {
        hits: result.hits.map((hit) => this.formatHit(hit)),
        found: result.found,
        page: result.page,
        perPage: result.per_page,
        facets: result.facet_counts || [],
      };
    } catch (error) {
      logger.error('Search error:', error);
      throw error;
    }
  }

  async getPageById(id) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents(id)
        .retrieve();

      return this.formatHit({ document: result });
    } catch (error) {
      if (error.httpStatus === 404) {
        return null;
      }

      logger.error('Get page error:', error);
      throw error;
    }
  }

  async getSuggestions(query) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents()
        .search({
          q: query,
          query_by: 'title, description',
          per_page: 5,
          num_typos: 1,
        });

      return result.hits.map((hit) => ({
        text: hit.document.title,
        type: 'title',
      }));
    } catch (error) {
      logger.error('Suggestions error:', error);
      return [];
    }
  }

  async searchImages(query, page = 1, sourceId = null) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents()
        .search(this.buildImageSearchParams({ query, page, sourceId }));

      await this.logSearch(query, result.found, sourceId, 'images');

      return {
        hits: result.hits.map((hit) => this.formatImageHit(hit)),
        found: result.found,
        page: result.page,
        perPage: result.per_page,
      };
    } catch (error) {
      logger.error('Image search error:', error);
      throw error;
    }
  }

  buildSearchParams({ query, page, perPage, sourceId }) {
    const params = {
      q: query,
      query_by: 'title, description, content, url',
      page: parseInt(page, 10),
      per_page: perPage,
      highlight_full_fields: 'title, description, content',
      snippet_threshold: 30,
      num_typos: 2,
      drop_tokens_threshold: 10,
      sort_by: '_text_match:desc,crawled_at:desc',
    };

    if (sourceId) {
      params.filter_by = `source_id:${sourceId}`;
    }

    return params;
  }

  buildImageSearchParams({ query, page, sourceId }) {
    const params = {
      q: query,
      query_by: 'title, description, image_alts, image_context, image_filenames',
      page: parseInt(page, 10),
      per_page: 20,
      highlight_full_fields: 'title, description, image_alts',
      snippet_threshold: 30,
      num_typos: 2,
      drop_tokens_threshold: 10,
      filter_by: 'has_images:true',
      sort_by: '_text_match:desc,crawled_at:desc',
      image_alts: { limit: 0 },
      image_context: { limit: 0 },
      image_filenames: { limit: 0 },
    };

    if (sourceId) {
      params.filter_by = `source_id:${sourceId} && has_images:true`;
    }

    return params;
  }

  formatHit(hit) {
    const doc = hit.document;
    const highlights = hit.highlight || {};

    return {
      id: doc.id,
      url: doc.url,
      title: doc.title,
      description: doc.description,
      content: doc.content,
      sourceId: doc.source_id,
      sourceName: doc.source_name || null,
      sourceUrl: doc.source_url || null,
      category: doc.category,
      domain: doc.domain,
      language: doc.language,
      images: doc.images || [],
      imageAlts: doc.image_alts || [],
      imageThumbnails: doc.image_thumbnails || [],
      hasImages: doc.has_images || false,
      crawledAt: doc.crawled_at ? new Date(doc.crawled_at).toISOString() : null,
      relevanceScore: doc.relevance_score,
      highlights: {
        title: highlights.title?.snippet || null,
        description: highlights.description?.snippet || null,
        content: highlights.content?.snippets?.slice(0, 3) || [],
      },
      score: hit.text_match || 0,
    };
  }

  formatImageHit(hit) {
    const doc = hit.document;
    const images = Array.isArray(doc.images)
      ? doc.images.map((imagePath, index) => ({
          localPath: imagePath,
          thumbnailPath: doc.image_thumbnails?.[index] || imagePath,
          alt: doc.image_alts?.[index] || doc.title,
          width: 0,
          height: 0,
        }))
      : [];

    return {
      id: doc.id,
      url: doc.url,
      title: doc.title,
      description: doc.description,
      domain: doc.domain,
      sourceId: doc.source_id,
      sourceName: doc.source_name || null,
      images,
      crawledAt: doc.crawled_at ? new Date(doc.crawled_at).toISOString() : null,
      score: hit.text_match || 0,
    };
  }

  async logSearch(query, resultsCount, sourceId = null, searchType = 'web') {
    try {
      await axios.post(`${this.crawlerApiUrl}/api/search-logs`, {
        query,
        resultsCount,
        sourceId,
        searchType,
        timestamp: new Date(),
      }).catch(() => {
        // Silently fail if crawler API is not available.
      });
    } catch (error) {
      logger.debug('Failed to log search:', error.message);
    }
  }
}

module.exports = SearchService;
