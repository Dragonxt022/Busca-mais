const { typesense, COLLECTION_NAME, ensureCollection } = require('../config/typesense');
const { logger } = require('./logger');
const { extractDomain } = require('./url-utils');
const textCleaner = require('../utils/textCleaner');

class Indexer {
  constructor() {
    this.initialized = false;
    this.crawlerUrl = process.env.CRAWLER_API_URL || `http://localhost:${process.env.PORT || 3001}`;
  }

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

  parseImagesForIndex(imagesData) {
    if (!imagesData) {
      return {
        images: [],
        image_alts: [],
        image_thumbnails: [],
        image_context: [],
        image_filenames: [],
        has_images: false,
        cover_image: null,
        cover_thumbnail: null,
        cover_alt: '',
      };
    }

    let images = [];
    try {
      images = typeof imagesData === 'string' ? JSON.parse(imagesData) : imagesData;
    } catch {
      return {
        images: [],
        image_alts: [],
        image_thumbnails: [],
        image_context: [],
        image_filenames: [],
        has_images: false,
        cover_image: null,
        cover_thumbnail: null,
        cover_alt: '',
      };
    }

    if (!Array.isArray(images) || images.length === 0) {
      return {
        images: [],
        image_alts: [],
        image_thumbnails: [],
        image_context: [],
        image_filenames: [],
        has_images: false,
        cover_image: null,
        cover_thumbnail: null,
        cover_alt: '',
      };
    }

    const firstImage = images[0];
    const coverImage = this.getImageUrl(firstImage.localPath || firstImage.originalUrl || firstImage.src);
    const coverThumbnail = this.getImageUrl(firstImage.thumbnailPath);
    const coverAlt = firstImage.alt || firstImage.title || '';

    return {
      images: images.map((img) => this.getImageUrl(img.localPath || img.originalUrl || img.src)).filter(Boolean),
      image_alts: images.map((img) => img.alt || img.title || '').filter(Boolean),
      image_thumbnails: images.map((img) => this.getImageUrl(img.thumbnailPath)).filter(Boolean),
      image_context: images.map((img) => img.context || '').filter(Boolean),
      image_filenames: images.map((img) => img.filename || '').filter(Boolean),
      has_images: images.length > 0,
      cover_image: coverImage || null,
      cover_thumbnail: coverThumbnail || null,
      cover_alt: coverAlt,
    };
  }

  generateDescription(content, maxLength = 200) {
    if (!content) return '';
    const cleaned = textCleaner.cleanText(content, { maxLength: maxLength * 3 }).replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.substring(0, maxLength).replace(/\s\S*$/, '')}...`;
  }

  generateSummary(text, maxLength = 500) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    const cleanText = textCleaner.cleanText(text, { maxLength: maxLength * 4 })
      .replace(/[#>*_`]/g, ' ')
      .replace(/https?:\/\/\S+/gi, ' ')
      .replace(/p[aá]gina inicial\s*\/\s*[^.]+/gi, ' ')
      .replace(/deixe um coment[aá]rio[\s\S]*$/i, ' ')
      .replace(/veja tamb[eé]m[\s\S]*$/i, ' ')
      .replace(/nenhum coment[aá]rio/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      return '';
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
        if (summary.length >= Math.min(220, maxLength * 0.7)) {
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

  sanitizeCatalogText(value) {
    const normalized = textCleaner.cleanText(String(value || ''), { maxLength: 1000 })
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized || /^detalhar$/i.test(normalized)) {
      return '';
    }

    return normalized;
  }

  normalizeCatalogMarkdown(markdown, title) {
    const raw = String(markdown || '').trim();

    if (!raw) {
      return '';
    }

    const lines = raw.split(/\r?\n/);
    const firstLine = String(lines[0] || '').trim();

    if (/^#\s+documento\s*$/i.test(firstLine)) {
      lines[0] = `# ${title}`;
      return lines.join('\n').trim();
    }

    if (!/^#\s+/.test(firstLine)) {
      return `# ${title}\n\n${raw}`.trim();
    }

    return raw;
  }

  buildPageDocument(page) {
    const imageData = this.parseImagesForIndex(page.images);
    const pageTextProcessing = textCleaner.processText(page.content_text || '');
    const metadataImage = page.metadata_json?.image || null;
    const metadataTitle = page.metadata_json?.title || page.title || '';
    const cleanedContentText = pageTextProcessing.clean_text;
    const contentBlocks = Array.isArray(page.metadata_json?.content_blocks)
      ? page.metadata_json.content_blocks
      : pageTextProcessing.blocks;
    const hasContent = typeof page.metadata_json?.has_content === 'boolean'
      ? page.metadata_json.has_content
      : pageTextProcessing.has_content;
    const cleanedDescription = textCleaner.cleanText(page.description || '', { maxLength: 1000 });
    const description = cleanedDescription || this.generateDescription(cleanedContentText);
    const summarySource = description || cleanedContentText || page.title || '';
    const summary = this.generateSummary(summarySource);
    const coverImage = imageData.cover_image || metadataImage || null;
    const coverThumbnail = imageData.cover_thumbnail || metadataImage || null;
    const coverAlt = imageData.cover_alt || metadataTitle || '';
    const images = imageData.images.length > 0
      ? imageData.images
      : (metadataImage ? [metadataImage] : []);
    const imageAlts = imageData.image_alts.length > 0
      ? imageData.image_alts
      : (metadataTitle ? [metadataTitle] : []);
    const imageThumbnails = imageData.image_thumbnails.length > 0
      ? imageData.image_thumbnails
      : (metadataImage ? [metadataImage] : []);

    return {
      id: String(page.id),
      title: page.title || '',
      description,
      content: cleanedContentText,
      content_blocks: contentBlocks,
      has_content: hasContent,
      summary,
      url: page.url,
      slug: page.slug || '',
      domain: extractDomain(page.url),
      category: page.source?.category || '',
      record_type: 'page',
      source_id: page.source_id,
      source_name: page.source?.name || '',
      source_url: page.source?.base_url || '',
      document_type: '',
      document_number: '',
      document_date: '',
      publication_date: '',
      download_url: '',
      file_extension: '',
      markdown_content: textCleaner.cleanMarkdown(cleanedContentText, { title: page.title || 'Pagina' }),
      images,
      image_alts: imageAlts,
      image_thumbnails: imageThumbnails,
      image_context: imageData.image_context,
      image_filenames: imageData.image_filenames,
      has_images: images.length > 0,
      cover_image: coverImage,
      cover_thumbnail: coverThumbnail,
      cover_alt: coverAlt,
      source_state: page.source?.state || '',
      source_city: page.source?.city || '',
      source_result_link_type: page.source?.result_link_type || 'detail_page',
      language: page.language || 'pt',
      crawled_at: page.last_crawled_at ? new Date(page.last_crawled_at).getTime() : Date.now(),
      relevance_score: this.calculateRelevanceScore(page),
    };
  }

  buildCatalogDocument(document) {
    const documentType = this.sanitizeCatalogText(document.tipo);
    const documentNumber = this.sanitizeCatalogText(document.numero_ano);
    const description = this.sanitizeCatalogText(document.descricao);
    const ementaText = this.sanitizeCatalogText(document.ementa);
    const documentDate = this.sanitizeCatalogText(document.data_documento);
    const publicationDate = this.sanitizeCatalogText(document.data_publicacao);
    const titleParts = [documentType, documentNumber].filter(Boolean);
    const title = titleParts.length > 0 ? titleParts.join(' ') : (description || 'Documento de catalogo');
    const extractedText = textCleaner.cleanText(
      String(document.metadata_json?.extracted_text || document.metadata_json?.raw_text || ''),
      { maxLength: 50000 }
    );
    const contentSource = extractedText || [description, ementaText].filter(Boolean).join('\n\n');
    const documentTextProcessing = textCleaner.processText(contentSource);
    const primaryUrl = document.download_url || document.detalhe_url || document.source?.source_url || '';
    const domain = primaryUrl ? extractDomain(primaryUrl) : extractDomain(document.source?.source_url || '');
    const content = documentTextProcessing.clean_text;
    const contentBlocks = Array.isArray(document.metadata_json?.extracted_blocks)
      ? document.metadata_json.extracted_blocks
      : documentTextProcessing.blocks;
    const hasContent = typeof document.metadata_json?.has_content === 'boolean'
      ? document.metadata_json.has_content
      : documentTextProcessing.has_content;
    const crawledAt = document.updated_at || document.created_at || new Date();
    const markdownContent = document.metadata_json?.extracted_markdown
      ? this.normalizeCatalogMarkdown(document.metadata_json.extracted_markdown, title)
      : textCleaner.cleanMarkdown(content || description || ementaText || title, { title });
    const summarySource = ementaText || description || content;
    const summary = this.generateSummary(summarySource);

    return {
      id: `catalog-${document.id}`,
      title,
      description: description || ementaText || title,
      content,
      content_blocks: contentBlocks,
      has_content: hasContent,
      summary,
      url: primaryUrl,
      slug: document.external_id || `catalog-${document.id}`,
      domain: domain || 'catalog.local',
      category: 'catalog',
      record_type: 'catalog_document',
      source_id: document.source_id,
      source_name: document.source?.name || document.source_name || '',
      source_url: document.source?.source_url || '',
      document_type: documentType,
      document_number: documentNumber,
      document_date: documentDate,
      publication_date: publicationDate,
      download_url: document.download_url || '',
      file_extension: this.sanitizeCatalogText(document.extension || '').toLowerCase(),
      markdown_content: markdownContent,
      images: [],
      image_alts: [],
      image_thumbnails: [],
      image_context: [],
      image_filenames: [],
      has_images: false,
      language: 'pt',
      crawled_at: new Date(crawledAt).getTime(),
      relevance_score: this.calculateCatalogRelevanceScore(document),
      source_state: document.source?.state || '',
      source_city: document.source?.city || '',
      source_result_link_type: document.source?.result_link_type || 'detail_page',
    };
  }

  async indexPage(page) {
    try {
      await this.init();
      await typesense.collections(COLLECTION_NAME).documents().upsert(this.buildPageDocument(page));
      logger.debug(`Indexed page: ${page.url}`);
      return true;
    } catch (error) {
      logger.error(`Error indexing page ${page.url}:`, error.message);
      return false;
    }
  }

  async indexCatalogDocument(document) {
    try {
      await this.init();
      await typesense.collections(COLLECTION_NAME).documents().upsert(this.buildCatalogDocument(document));
      logger.debug(`Indexed catalog document: ${document.id}`);
      return true;
    } catch (error) {
      logger.error(`Error indexing catalog document ${document.id}:`, error.message);
      return false;
    }
  }

  async indexPages(pages) {
    await this.init();

    const results = {
      total: pages.length,
      indexed: 0,
      failed: 0,
      errors: [],
    };

    const batchSize = 100;
    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      const documents = batch.map((page) => this.buildPageDocument(page));

      try {
        await typesense.collections(COLLECTION_NAME).documents().import(documents);
        results.indexed += batch.length;
      } catch (error) {
        for (const doc of documents) {
          try {
            await typesense.collections(COLLECTION_NAME).documents().upsert(doc);
            results.indexed += 1;
          } catch (err) {
            results.failed += 1;
            results.errors.push({ url: doc.url, error: err.message });
          }
        }
      }
    }

    logger.info(`Indexing complete: ${results.indexed} indexed, ${results.failed} failed`);
    return results;
  }

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

  async deleteCatalogDocument(documentId) {
    try {
      await typesense.collections(COLLECTION_NAME).documents(`catalog-${documentId}`).delete();
      logger.debug(`Deleted catalog document from index: ${documentId}`);
      return true;
    } catch (error) {
      if (error.httpStatus === 404) {
        logger.debug(`Catalog document not found in index: ${documentId}`);
        return true;
      }

      logger.error(`Error deleting catalog document ${documentId}:`, error.message);
      return false;
    }
  }

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
        hits: result.hits?.map((hit) => ({
          id: hit.document.id,
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

  calculateRelevanceScore(page) {
    let score = 0;
    if (page.title) score += 10;
    if (page.description) score += 5;

    if (page.word_count) {
      if (page.word_count > 500) score += 10;
      else if (page.word_count > 200) score += 5;
      else if (page.word_count > 100) score += 2;
    }

    if (page.last_crawled_at) {
      const daysSinceCrawl = (Date.now() - new Date(page.last_crawled_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCrawl < 7) score += 10;
      else if (daysSinceCrawl < 30) score += 5;
      else if (daysSinceCrawl < 90) score += 2;
    }

    return Math.min(score, 100);
  }

  calculateCatalogRelevanceScore(document) {
    let score = 10;
    if (document.descricao) score += 20;
    if (document.ementa) score += 15;
    if (document.download_url) score += 10;
    if (document.data_publicacao) score += 5;
    if (document.updated_at) score += 5;
    return Math.min(score, 100);
  }

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

      if (filters.domain) {
        searchParams.filter_by = `${searchParams.filter_by} && domain:${filters.domain}`;
      }
      if (filters.category) {
        searchParams.filter_by = `${searchParams.filter_by} && category:${filters.category}`;
      }

      const result = await typesense.collections(COLLECTION_NAME).documents().search(searchParams);

      const imageResults = [];
      for (const hit of result.hits || []) {
        const doc = hit.document;
        const thumbnails = doc.image_thumbnails || [];
        const alts = doc.image_alts || [];
        const images = doc.images || [];

        for (let i = 0; i < thumbnails.length; i += 1) {
          imageResults.push({
            id: doc.id,
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
