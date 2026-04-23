const { hashUrl } = require('../../../libs/url-utils');
const SearchableSource = require('../models/searchable-source.model');
const ContentItem = require('../models/content-item.model');
const { Source, Page, CatalogSource, CatalogDocument } = require('../../../models');
const { logger } = require('../../../libs/logger');

/**
 * Mapeia Source (legado) → SearchableSource (unificado).
 */
function mapSourceToSearchable(source) {
  const kindMap = {
    website: 'institutional_site',
    blog: 'news_site',
    news: 'news_site',
    government: 'institutional_site',
    documentation: 'institutional_site',
    other: 'other',
  };

  const slug = source.base_url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 200);

  return {
    name: source.name,
    slug: `src-${source.id}-${slug}`,
    base_url: source.base_url,
    source_kind: kindMap[source.type] || 'other',
    crawl_strategy: 'web_crawl',
    state: source.state || null,
    city: source.city || null,
    is_active: source.is_active,
    schedule: source.schedule || null,
    last_crawled_at: source.last_crawled_at || null,
    max_items: source.max_pages || null,
    config_json: {
      ...(source.config_json || {}),
      crawl_depth: source.crawl_depth,
      follow_internal_links: source.follow_internal_links,
      delay_between_requests: source.delay_between_requests,
      user_agent: source.user_agent,
      result_link_type: source.result_link_type,
    },
    legacy_source_id: source.id,
    legacy_catalog_source_id: null,
  };
}

/**
 * Mapeia CatalogSource (legado) → SearchableSource (unificado).
 */
function mapCatalogSourceToSearchable(catalogSource) {
  const slug = catalogSource.slug;

  return {
    name: catalogSource.name,
    slug: `cat-${slug}`,
    base_url: catalogSource.source_url,
    source_kind: 'transparency_portal',
    crawl_strategy: 'listing',
    state: catalogSource.state || null,
    city: catalogSource.city || null,
    is_active: catalogSource.is_active,
    schedule: catalogSource.schedule_type !== 'manual' ? _scheduleTypeToExpression(catalogSource.schedule_type) : null,
    last_crawled_at: catalogSource.last_run_at || null,
    max_items: catalogSource.max_documents || null,
    config_json: catalogSource.config_json || {},
    legacy_source_id: null,
    legacy_catalog_source_id: catalogSource.id,
  };
}

/**
 * Mapeia Page (legado) → ContentItem (unificado).
 */
function mapPageToContentItem(page, searchableSourceId) {
  const url = page.canonical_url || page.url;
  const urlH = hashUrl(url);

  return {
    source_id: searchableSourceId,
    url: page.url,
    canonical_url: page.canonical_url || page.url,
    title: page.title || null,
    description: page.description || null,
    text_content: page.content_text || null,
    markdown_content: null,
    item_kind: 'page',
    document_type: null,
    document_number: null,
    publication_date: null,
    department: null,
    file_url: null,
    file_extension: null,
    content_hash: page.hash_content || null,
    url_hash: urlH,
    images_json: page.images || null,
    metadata_json: page.metadata_json || null,
    status: page.last_indexed_at ? 'indexed' : 'pending',
    has_error: page.has_error || false,
    error_message: page.error_message || null,
    last_crawled_at: page.last_crawled_at || null,
    last_indexed_at: page.last_indexed_at || null,
    legacy_page_id: page.id,
    legacy_catalog_document_id: null,
  };
}

/**
 * Mapeia CatalogDocument (legado) → ContentItem (unificado).
 */
function mapCatalogDocumentToContentItem(doc, searchableSourceId) {
  const url = doc.detalhe_url || doc.download_url || doc.source?.source_url || '';
  const urlH = url ? hashUrl(`cat-${doc.id}-${url}`) : hashUrl(`cat-doc-${doc.id}`);

  const titleParts = [doc.tipo, doc.numero_ano].filter(Boolean);
  const title = titleParts.join(' ') || doc.descricao || `Documento ${doc.id}`;

  return {
    source_id: searchableSourceId,
    url: url || `catalog://doc/${doc.id}`,
    canonical_url: url || null,
    title: title.substring(0, 500),
    description: doc.ementa || doc.descricao || null,
    text_content: doc.metadata_json?.extracted_text || doc.metadata_json?.raw_text || null,
    markdown_content: doc.metadata_json?.extracted_markdown || null,
    item_kind: doc.extension?.toLowerCase() === 'pdf' ? 'pdf' : 'official_document',
    document_type: doc.tipo || null,
    document_number: doc.numero_ano || null,
    publication_date: doc.data_publicacao || doc.data_documento || null,
    department: doc.source_name || null,
    file_url: doc.download_url || null,
    file_extension: (doc.extension || '').toUpperCase() || null,
    content_hash: doc.row_hash || null,
    url_hash: urlH,
    images_json: null,
    metadata_json: doc.metadata_json || null,
    status: doc.status === 'indexed' ? 'indexed' : 'pending',
    has_error: doc.status === 'error',
    error_message: null,
    last_crawled_at: doc.updated_at || doc.created_at || null,
    last_indexed_at: doc.status === 'indexed' ? (doc.updated_at || doc.created_at) : null,
    legacy_page_id: null,
    legacy_catalog_document_id: doc.id,
  };
}

function _scheduleTypeToExpression(scheduleType) {
  const map = {
    hourly: '0 * * * *',
    daily: '0 2 * * *',
    weekly: '0 2 * * 0',
  };
  return map[scheduleType] || null;
}

/**
 * Executa a migracao incremental de todas as Sources legadas.
 * Cria SearchableSources e ContentItems correspondentes.
 */
async function migrateSources({ limit = 100, offset = 0 } = {}) {
  const sources = await Source.findAll({ limit, offset, where: { is_active: true } });
  const results = { sources: 0, pages: 0, errors: 0 };

  for (const source of sources) {
    try {
      const mapped = mapSourceToSearchable(source);
      const [ss] = await SearchableSource.findOrCreate({
        where: { legacy_source_id: source.id },
        defaults: mapped,
      });

      results.sources++;

      // Migra pages dessa source em lotes
      const pages = await Page.findAll({ where: { source_id: source.id }, limit: 5000 });
      for (const page of pages) {
        try {
          const ci = mapPageToContentItem(page, ss.id);
          await ContentItem.findOrCreate({ where: { url_hash: ci.url_hash }, defaults: ci });
          results.pages++;
        } catch (err) {
          logger.debug(`migrateSources: pagina ${page.id} ignorada: ${err.message}`);
          results.errors++;
        }
      }
    } catch (err) {
      logger.error(`migrateSources: source ${source.id} falhou: ${err.message}`);
      results.errors++;
    }
  }

  logger.info(`migrateSources: ${results.sources} fontes, ${results.pages} paginas, ${results.errors} erros`);
  return results;
}

/**
 * Executa a migracao incremental de todas as CatalogSources legadas.
 */
async function migrateCatalogSources({ limit = 50, offset = 0 } = {}) {
  const catalogSources = await CatalogSource.findAll({ limit, offset });
  const results = { sources: 0, documents: 0, errors: 0 };

  for (const cs of catalogSources) {
    try {
      const mapped = {
        name: cs.name,
        slug: `cat-${cs.slug}`,
        base_url: cs.source_url,
        source_kind: 'transparency_portal',
        crawl_strategy: 'listing',
        state: cs.state || null,
        city: cs.city || null,
        is_active: cs.is_active,
        schedule: _scheduleTypeToExpression(cs.schedule_type),
        last_crawled_at: cs.last_run_at || null,
        max_items: cs.max_documents || null,
        config_json: cs.config_json || {},
        legacy_source_id: null,
        legacy_catalog_source_id: cs.id,
      };

      const [ss] = await SearchableSource.findOrCreate({
        where: { legacy_catalog_source_id: cs.id },
        defaults: mapped,
      });

      results.sources++;

      const docs = await CatalogDocument.findAll({ where: { source_id: cs.id }, limit: 5000 });
      for (const doc of docs) {
        try {
          doc.source = cs;
          const ci = mapCatalogDocumentToContentItem(doc, ss.id);
          await ContentItem.findOrCreate({ where: { url_hash: ci.url_hash }, defaults: ci });
          results.documents++;
        } catch (err) {
          logger.debug(`migrateCatalogSources: documento ${doc.id} ignorado: ${err.message}`);
          results.errors++;
        }
      }
    } catch (err) {
      logger.error(`migrateCatalogSources: catalog_source ${cs.id} falhou: ${err.message}`);
      results.errors++;
    }
  }

  logger.info(`migrateCatalogSources: ${results.sources} fontes, ${results.documents} documentos, ${results.errors} erros`);
  return results;
}

module.exports = {
  mapSourceToSearchable,
  mapCatalogSourceToSearchable,
  mapPageToContentItem,
  mapCatalogDocumentToContentItem,
  migrateSources,
  migrateCatalogSources,
};
