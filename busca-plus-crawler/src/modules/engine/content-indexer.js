const { typesense, COLLECTION_NAME, ensureCollection } = require('../../config/typesense');
const { logger } = require('../../libs/logger');
const { extractDomain } = require('../../libs/url-utils');
const textCleaner = require('../../utils/textCleaner');
const ContentItem = require('./models/content-item.model');
const PipelineRun = require('./models/pipeline-run.model');

/**
 * Indexador unificado que aceita ContentItem e normaliza para o schema Typesense existente.
 * Compativel com o schema da colecao "pages" para nao quebrar a busca atual.
 */
class ContentIndexer {
  constructor() {
    this.initialized = false;
    this.crawlerUrl = process.env.CRAWLER_API_URL || `http://localhost:${process.env.PORT || 3001}`;
  }

  async init() {
    if (!this.initialized) {
      await ensureCollection();
      this.initialized = true;
    }
  }

  /**
   * Converte um ContentItem para o documento normalizado do Typesense.
   * @param {ContentItem} item
   * @param {SearchableSource} source
   * @returns {Object} Documento Typesense
   */
  buildDocument(item, source) {
    const textProcessing = textCleaner.processText(item.text_content || '');
    const cleanContent = textProcessing.clean_text;
    const contentBlocks = textProcessing.blocks;
    const hasContent = textProcessing.has_content;

    const cleanDescription = textCleaner.cleanText(item.description || '', { maxLength: 1000 });
    const description = cleanDescription || this._generateDescription(cleanContent);
    const summarySource = cleanDescription || cleanContent || item.title || '';
    const summary = this._generateSummary(summarySource);

    const images = this._parseImages(item.images_json);
    const primaryUrl = item.file_url || item.url;
    const domain = extractDomain(primaryUrl);

    const recordType = this._mapItemKindToRecordType(item.item_kind);

    const markdownContent = item.markdown_content ||
      textCleaner.cleanMarkdown(cleanContent || description || item.title || '', {
        title: item.title || 'Documento',
      });

    return {
      // ID unico: prefixo "ci-" para diferenciar de pages e catalog_documents legados
      id: `ci-${item.id}`,
      title: item.title || '',
      description,
      content: cleanContent,
      content_blocks: contentBlocks,
      has_content: hasContent,
      summary,
      url: primaryUrl || item.url,
      slug: item.url_hash || `ci-${item.id}`,
      domain: domain || 'unknown',
      category: source?.source_kind || '',
      record_type: recordType,
      source_id: source?.id || item.source_id,
      source_name: source?.name || '',
      source_url: source?.base_url || '',
      document_type: item.document_type || '',
      document_number: item.document_number || '',
      document_date: item.publication_date || '',
      publication_date: item.publication_date || '',
      download_url: item.file_url || '',
      file_extension: (item.file_extension || '').toLowerCase(),
      markdown_content: markdownContent,
      images: images.urls,
      image_alts: images.alts,
      image_thumbnails: images.thumbnails,
      image_context: images.context,
      image_filenames: images.filenames,
      has_images: images.urls.length > 0,
      cover_image: images.coverUrl || null,
      cover_thumbnail: images.coverThumbnail || null,
      cover_alt: images.coverAlt || '',
      source_state: source?.state || '',
      source_city: source?.city || '',
      source_result_link_type: 'detail_page',
      language: item.metadata_json?.language || 'pt',
      crawled_at: item.last_crawled_at ? new Date(item.last_crawled_at).getTime() : Date.now(),
      relevance_score: this._calculateRelevanceScore(item),
    };
  }

  async indexItem(item, source) {
    try {
      await this.init();
      const doc = this.buildDocument(item, source);
      await typesense.collections(COLLECTION_NAME).documents().upsert(doc);
      await item.update({ status: 'indexed', last_indexed_at: new Date() });
      logger.debug(`ContentIndexer: indexado ci-${item.id} (${item.url})`);
      return true;
    } catch (err) {
      await item.update({ status: 'error', error_message: err.message });
      logger.error(`ContentIndexer: falha ao indexar ci-${item.id}: ${err.message}`);
      return false;
    }
  }

  async indexBatch(items, sourceMap) {
    await this.init();
    const results = { total: items.length, indexed: 0, failed: 0 };
    const batchSize = 100;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const docs = batch.map((item) => this.buildDocument(item, sourceMap[item.source_id]));

      try {
        await typesense.collections(COLLECTION_NAME).documents().import(docs, { action: 'upsert' });
        results.indexed += batch.length;

        await ContentItem.update(
          { status: 'indexed', last_indexed_at: new Date() },
          { where: { id: batch.map((item) => item.id) } }
        );
      } catch (err) {
        for (let j = 0; j < batch.length; j++) {
          try {
            await typesense.collections(COLLECTION_NAME).documents().upsert(docs[j]);
            await batch[j].update({ status: 'indexed', last_indexed_at: new Date() });
            results.indexed++;
          } catch (innerErr) {
            await batch[j].update({ status: 'error', error_message: innerErr.message });
            results.failed++;
          }
        }
      }
    }

    logger.info(`ContentIndexer: ${results.indexed}/${results.total} indexados`);
    return results;
  }

  async deleteItem(itemId) {
    try {
      await this.init();
      await typesense.collections(COLLECTION_NAME).documents(`ci-${itemId}`).delete();
      return true;
    } catch {
      return false;
    }
  }

  _mapItemKindToRecordType(itemKind) {
    const map = {
      page: 'page',
      news: 'page',
      official_document: 'catalog_document',
      pdf: 'catalog_document',
      protocol: 'catalog_document',
      attachment: 'catalog_document',
      listing_item: 'page',
      other: 'page',
    };
    return map[itemKind] || 'page';
  }

  _parseImages(imagesJson) {
    const empty = { urls: [], alts: [], thumbnails: [], context: [], filenames: [], coverUrl: null, coverThumbnail: null, coverAlt: '' };
    if (!imagesJson) return empty;

    let images;
    try {
      images = Array.isArray(imagesJson) ? imagesJson : JSON.parse(imagesJson);
    } catch {
      return empty;
    }
    if (!images.length) return empty;

    const first = images[0];
    return {
      urls: images.map((img) => img.src || img.url || img.localPath || '').filter(Boolean),
      alts: images.map((img) => img.alt || ''),
      thumbnails: images.map((img) => img.thumbnailPath || img.src || '').filter(Boolean),
      context: images.map((img) => img.context || ''),
      filenames: images.map((img) => img.filename || ''),
      coverUrl: first.src || first.url || first.localPath || null,
      coverThumbnail: first.thumbnailPath || first.src || null,
      coverAlt: first.alt || '',
    };
  }

  _generateDescription(content, maxLength = 200) {
    if (!content) return '';
    const clean = content.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;

    const truncated = clean.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    const cut = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
    return `${cut}...`;
  }

  _generateSummary(text, maxLength = 500) {
    if (!text) return '';
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    const truncated = clean.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > maxLength * 0.8 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
  }

  _calculateRelevanceScore(item) {
    let score = 0.5;
    if (item.title) score += 0.1;
    if (item.description) score += 0.1;
    if (item.text_content && item.text_content.length > 100) score += 0.2;
    if (item.document_type) score += 0.1;
    return Math.min(score, 1.0);
  }
}

module.exports = new ContentIndexer();
