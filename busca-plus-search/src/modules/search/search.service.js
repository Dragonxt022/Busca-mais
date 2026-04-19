const axios = require('axios');

const config = require('../../config');
const { typesense, COLLECTION_NAME } = require('../../config/typesense');
const { logger } = require('../../libs/logger');

const MAX_SUMMARY_LENGTH = 500;
const SNIPPET_LENGTH = 220;
const FOCUS_LENGTH = 140;

class SearchService {
  constructor() {
    this.collectionName = COLLECTION_NAME;
    this.crawlerApiUrl = config.crawler.apiUrl;
    this.crawlerExternalUrl = config.crawler.externalUrl;
  }

  generateSummary(text, maxLength = MAX_SUMMARY_LENGTH) {
    if (!text || typeof text !== 'string') {
      return null;
    }

    const cleanText = text
      .replace(/[#>*_`]/g, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/p[aá]gina inicial\s*\/\s*[^.]+/gi, ' ')
      .replace(/deixe um coment[aá]rio[\s\S]*$/i, ' ')
      .replace(/veja tamb[eé]m[\s\S]*$/i, ' ')
      .replace(/nenhum coment[aá]rio/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      return null;
    }

    const sentences = cleanText
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length >= 45 && sentence.length <= 280);

    if (sentences.length > 0) {
      let summary = '';

      for (const sentence of sentences) {
        const nextValue = summary ? `${summary} ${sentence}` : sentence;
        if (nextValue.length > maxLength) {
          break;
        }

        summary = nextValue;
        if (summary.length >= Math.min(240, maxLength * 0.7)) {
          break;
        }
      }

      if (summary) {
        return summary;
      }
    }

    if (cleanText.length <= maxLength) {
      return cleanText;
    }

    const truncated = cleanText.slice(0, maxLength);
    
    const lastPeriodIndex = truncated.lastIndexOf('.');
    const lastExclamationIndex = truncated.lastIndexOf('!');
    const lastQuestionIndex = truncated.lastIndexOf('?');
    
    const lastSentenceEnd = Math.max(
      lastPeriodIndex,
      lastExclamationIndex,
      lastQuestionIndex
    );

    if (lastSentenceEnd > maxLength * 0.6) {
      return truncated.slice(0, lastSentenceEnd + 1);
    }

    const lastSpaceIndex = truncated.lastIndexOf(' ');
    if (lastSpaceIndex > maxLength * 0.8) {
      return truncated.slice(0, lastSpaceIndex) + '...';
    }

    return truncated + '...';
  }

  escapeRegExp(string) {
    return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  stripHtml(value) {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  tokenizeQuery(query) {
    return Array.from(new Set(
      String(query || '')
        .toLowerCase()
        .split(/[^a-z0-9Ã-Ã¿]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    ));
  }

  highlightSnippet(text, tokens) {
    const normalizedText = String(text || '');

    if (!normalizedText) {
      return null;
    }

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return this.escapeHtml(normalizedText);
    }

    const regex = new RegExp(`(${tokens.map((token) => this.escapeRegExp(token)).join('|')})`, 'gi');
    let cursor = 0;
    let html = '';

    normalizedText.replace(regex, (match, _group, offset) => {
      html += this.escapeHtml(normalizedText.slice(cursor, offset));
      html += `<mark>${this.escapeHtml(match)}</mark>`;
      cursor = offset + match.length;
      return match;
    });

    html += this.escapeHtml(normalizedText.slice(cursor));
    return html;
  }

  buildSnippet(text, query, maxLength = SNIPPET_LENGTH) {
    const cleanText = this.stripHtml(text);

    if (!cleanText) {
      return {
        html: null,
        text: null,
        focusText: null,
      };
    }

    const tokens = this.tokenizeQuery(query);

    if (tokens.length === 0) {
      const fallback = this.generateSummary(cleanText, maxLength) || cleanText.slice(0, maxLength);

      return {
        html: this.escapeHtml(fallback),
        text: fallback,
        focusText: fallback.slice(0, FOCUS_LENGTH).trim(),
      };
    }

    const regex = new RegExp(tokens.map((token) => this.escapeRegExp(token)).join('|'), 'i');
    const match = regex.exec(cleanText);

    if (!match) {
      const fallback = this.generateSummary(cleanText, maxLength) || cleanText.slice(0, maxLength);

      return {
        html: this.highlightSnippet(fallback, tokens),
        text: fallback,
        focusText: fallback.slice(0, FOCUS_LENGTH).trim(),
      };
    }

    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const halfWindow = Math.floor(maxLength / 2);
    let start = Math.max(0, matchStart - halfWindow);
    let end = Math.min(cleanText.length, matchEnd + halfWindow);

    if (start > 0) {
      const nextSpace = cleanText.indexOf(' ', start);
      if (nextSpace > -1 && nextSpace < matchStart) {
        start = nextSpace + 1;
      }
    }

    if (end < cleanText.length) {
      const previousSpace = cleanText.lastIndexOf(' ', end);
      if (previousSpace > matchEnd) {
        end = previousSpace;
      }
    }

    const snippetCore = cleanText.slice(start, end).trim();
    const snippetText = `${start > 0 ? '... ' : ''}${snippetCore}${end < cleanText.length ? ' ...' : ''}`.trim();
    const focusStart = Math.max(0, matchStart - Math.floor(FOCUS_LENGTH / 2));
    const focusEnd = Math.min(cleanText.length, matchEnd + Math.floor(FOCUS_LENGTH / 2));
    const focusText = cleanText.slice(focusStart, focusEnd).trim();

    return {
      html: this.highlightSnippet(snippetText, tokens),
      text: snippetText,
      focusText,
    };
  }

  getTextForSummary(doc) {
    if (doc.record_type === 'catalog_document') {
      if (doc.description) return doc.description;
      if (doc.ementa) return doc.ementa;
      if (doc.extracted_text) return doc.extracted_text;
    }
    
    if (doc.description) return doc.description;
    if (doc.content) return doc.content;
    
    return null;
  }

  buildDetailUrl(id, { query = '', focus = '' } = {}) {
    const search = new URLSearchParams();
    if (query) {
      search.set('q', query);
    }
    if (focus) {
      search.set('focus', focus);
    }

    const suffix = search.toString();
    return `/page/${id}${suffix ? `?${suffix}` : ''}`;
  }

  async search(query, page = 1, sourceId = null, state = null, city = null) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents()
        .search(this.buildSearchParams({ query, page, perPage: 10, sourceId, state, city }));

      await this.logSearch(query, result.found, sourceId);

      return {
        hits: result.hits.map((hit) => this.formatHit(hit, query)),
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

  async getActiveSponsors(state = null, city = null) {
    try {
      const params = new URLSearchParams();
      if (state) params.set('state', state);
      if (city) params.set('city', city);
      params.set('limit', '100');
      const qs = params.toString();
      const { data } = await axios.get(
        `${this.crawlerApiUrl}/api/sponsors${qs ? `?${qs}` : ''}`,
        { timeout: 2000 },
      );
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async getPageById(id) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents(id)
        .retrieve();

      return this.formatHit({ document: result }, '');
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

  async searchImages(query, page = 1, sourceId = null, state = null, city = null) {
    try {
      const result = await typesense.collections(this.collectionName)
        .documents()
        .search(this.buildImageSearchParams({ query, page, sourceId, state, city }));

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

  buildSearchParams({ query, page, perPage, sourceId, state = null, city = null }) {
    const params = {
      q: query,
      query_by: 'title, description, content, document_type, document_number, source_name, publication_date, url',
      page: parseInt(page, 10),
      per_page: perPage,
      highlight_full_fields: 'title, description, content, document_type, document_number, source_name',
      snippet_threshold: 30,
      num_typos: 2,
      drop_tokens_threshold: 10,
      sort_by: '_text_match:desc,crawled_at:desc',
    };

    const filters = [];
    if (sourceId) filters.push(`source_id:=${sourceId}`);
    if (state) filters.push(`source_state:=${state}`);
    if (city) filters.push(`source_city:=${city}`);
    if (filters.length) params.filter_by = filters.join(' && ');

    return params;
  }

  buildImageSearchParams({ query, page, sourceId, state = null, city = null }) {
    const filters = ['has_images:true'];
    if (sourceId) filters.push(`source_id:=${sourceId}`);
    if (state) filters.push(`source_state:=${state}`);
    if (city) filters.push(`source_city:=${city}`);

    return {
      q: query,
      query_by: 'title, description, image_alts, image_context, image_filenames',
      page: parseInt(page, 10),
      per_page: 20,
      highlight_full_fields: 'title, description, image_alts',
      snippet_threshold: 30,
      num_typos: 2,
      drop_tokens_threshold: 10,
      filter_by: filters.join(' && '),
      sort_by: '_text_match:desc,crawled_at:desc',
      image_alts: { limit: 0 },
      image_context: { limit: 0 },
      image_filenames: { limit: 0 },
    };
  }

  formatHit(hit, query = '') {
    const doc = hit.document;
    const highlights = hit.highlight || {};
    const openUrl = doc.download_url || doc.url;

    const textForSummary = this.getTextForSummary(doc);
    const summary = this.generateSummary(textForSummary) || doc.summary || null;
    const snippetSource = textForSummary || doc.title || '';
    const snippet = this.buildSnippet(snippetSource, query);

    return {
      id: doc.id,
      url: doc.url,
      title: doc.title,
      description: doc.description,
      content: doc.content,
      summary,
      sourceId: doc.source_id,
      sourceName: doc.source_name || null,
      sourceUrl: doc.source_url || null,
      category: doc.category,
      recordType: doc.record_type || null,
      documentType: doc.document_type || null,
      documentNumber: doc.document_number || null,
      documentDate: doc.document_date || null,
      publicationDate: doc.publication_date || null,
      downloadUrl: doc.download_url || null,
      fileExtension: doc.file_extension || null,
      markdownContent: doc.markdown_content || null,
      detailUrl: this.buildDetailUrl(doc.id, { query, focus: snippet.focusText }),
      openUrl,
      resultUrl: doc.source_result_link_type === 'direct_document'
        ? openUrl
        : this.buildDetailUrl(doc.id, { query, focus: snippet.focusText }),
      sourceLinkUrl: doc.source_url || doc.url,
      domain: doc.domain,
      language: doc.language,
      images: doc.images || [],
      imageAlts: doc.image_alts || [],
      imageThumbnails: doc.image_thumbnails || [],
      hasImages: doc.has_images || false,
      coverImage: doc.cover_image || null,
      coverThumbnail: doc.cover_thumbnail || null,
      coverAlt: doc.cover_alt || '',
      crawledAt: doc.crawled_at ? new Date(doc.crawled_at).toISOString() : null,
      relevanceScore: doc.relevance_score,
      highlights: {
        title: highlights.title?.snippet || null,
        description: highlights.description?.snippet || null,
        content: highlights.content?.snippets?.slice(0, 3) || [],
      },
      matchSnippetHtml: snippet.html,
      matchSnippetText: snippet.text,
      focusText: snippet.focusText,
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
