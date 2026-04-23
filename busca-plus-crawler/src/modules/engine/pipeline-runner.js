const crypto = require('crypto');
const { Op } = require('sequelize');
const { logger } = require('../../libs/logger');
const { hashUrl, normalizeUrl } = require('../../libs/url-utils');
const classifier = require('./classifier');
const { selectAdapter } = require('./adapters/registry');
const Fetcher = require('./fetcher');
const { CujubimPublicacoesCrawler } = require('../transparency/crawlers/cujubim-publicacoes-crawler');
const catalogDocumentContentService = require('../transparency/services/catalog-document-content.service');
const ContentItem = require('./models/content-item.model');
const SearchableSource = require('./models/searchable-source.model');
const PipelineRun = require('./models/pipeline-run.model');

/**
 * Pipeline unificado de descoberta, extracao, normalizacao, deduplicacao e persistencia.
 *
 * Fluxo por item:
 *   1. Buscar conteudo (HTTP ou browser)
 *   2. Classificar entrada
 *   3. Selecionar adaptador
 *   4. Extrair ContentItem[]
 *   5. Normalizar campos
 *   6. Deduplicar (URL hash + content hash)
 *   7. Persistir / atualizar
 *   8. Enfileirar novos links descobertos
 *   9. Retornar itens para indexacao
 */
class PipelineRunner {
  constructor() {
    this.fetcher = new Fetcher();
  }

  /**
   * Processa uma URL individual dentro de uma fonte.
   * @param {string} url
   * @param {SearchableSource} source
   * @param {PipelineRun} [run]
   * @returns {Promise<{ items: ContentItem[], discoveredUrls: string[] }>}
   */
  async processUrl(url, source, run = null) {
    const normalized = normalizeUrl(url);
    logger.debug(`PipelineRunner: processando ${normalized}`);

    let fetchResult;
    try {
      fetchResult = await this.fetcher.fetch(normalized);
    } catch (err) {
      logger.warn(`PipelineRunner: fetch falhou para ${normalized}: ${err.message}`);
      if (run) await this._incrementError(run);
      return { items: [], discoveredUrls: [] };
    }

    const { html, buffer, contentType, finalUrl } = fetchResult;
    const effectiveUrl = finalUrl || normalized;

    const classifiedAs = classifier.classify({ url: effectiveUrl, contentType, html: html || '' });
    logger.debug(`PipelineRunner: classificado como ${classifiedAs}`);

    const input = {
      url: effectiveUrl,
      html,
      buffer,
      contentType,
      classifiedAs,
      source,
      config: source.config_json || {},
    };

    const { adapter, score } = selectAdapter(input);
    if (!adapter || score === 0) {
      logger.warn(`PipelineRunner: nenhum adaptador para ${classifiedAs} em ${effectiveUrl}`);
      if (run) await this._incrementError(run);
      return { items: [], discoveredUrls: [] };
    }

    logger.debug(`PipelineRunner: usando adaptador ${adapter.name} (score=${score})`);

    let extracted;
    try {
      extracted = await adapter.extract(input);
    } catch (err) {
      logger.error(`PipelineRunner: adaptador ${adapter.name} falhou em ${effectiveUrl}: ${err.message}`);
      if (run) await this._incrementError(run);
      return { items: [], discoveredUrls: [] };
    }

    const allDiscoveredUrls = [];
    const persistedItems = [];

    for (const extractedItem of extracted) {
      if (extractedItem.discoveredUrls?.length) {
        allDiscoveredUrls.push(...extractedItem.discoveredUrls);
      }

      const contentItem = await this._persistItem(extractedItem, source, run);
      if (contentItem) persistedItems.push(contentItem);
    }

    if (run && persistedItems.length) {
      await this._incrementFound(run, persistedItems.length);
    }

    return { items: persistedItems, discoveredUrls: [...new Set(allDiscoveredUrls)] };
  }

  /**
   * Persiste ou atualiza um ContentItem extraido.
   * Usa url_hash como chave de deduplicacao primaria.
   * Usa content_hash para detectar mudancas reais de conteudo.
   */
  async _persistItem(extracted, source, run) {
    const canonicalUrl = extracted.canonicalUrl || extracted.url;
    const urlH = hashUrl(canonicalUrl);

    const contentStr = extracted.textContent || extracted.title || '';
    const contentH = contentStr
      ? crypto.createHash('sha256').update(contentStr.substring(0, 10000)).digest('hex')
      : null;

    const [item, created] = await ContentItem.findOrCreate({
      where: { url_hash: urlH },
      defaults: {
        source_id: source.id,
        url: extracted.url.substring(0, 1000),
        canonical_url: canonicalUrl.substring(0, 1000),
        title: (extracted.title || '').substring(0, 500),
        description: (extracted.description || '').substring(0, 2000),
        text_content: (extracted.textContent || '').substring(0, 100000),
        markdown_content: extracted.markdownContent || null,
        item_kind: extracted.itemKind || 'page',
        document_type: extracted.documentType || null,
        document_number: extracted.documentNumber || null,
        publication_date: extracted.publicationDate || null,
        department: extracted.department || null,
        file_url: extracted.fileUrl || null,
        file_extension: extracted.fileExtension || null,
        content_hash: contentH,
        url_hash: urlH,
        images_json: extracted.images || null,
        metadata_json: extracted.metadata || null,
        status: 'pending',
        last_crawled_at: new Date(),
      },
    });

    if (!created) {
      // Atualiza apenas se o conteudo mudou
      if (contentH && item.content_hash === contentH) {
        logger.debug(`PipelineRunner: conteudo nao mudou para ${canonicalUrl}`);
        return item;
      }

      await item.update({
        title: (extracted.title || item.title || '').substring(0, 500),
        description: (extracted.description || item.description || '').substring(0, 2000),
        text_content: (extracted.textContent || '').substring(0, 100000),
        markdown_content: extracted.markdownContent || item.markdown_content,
        document_type: extracted.documentType || item.document_type,
        document_number: extracted.documentNumber || item.document_number,
        publication_date: extracted.publicationDate || item.publication_date,
        department: extracted.department || item.department,
        file_url: extracted.fileUrl || item.file_url,
        file_extension: extracted.fileExtension || item.file_extension,
        content_hash: contentH,
        images_json: extracted.images || item.images_json,
        metadata_json: extracted.metadata || item.metadata_json,
        status: 'pending',
        has_error: false,
        error_message: null,
        last_crawled_at: new Date(),
      });

      if (run) await this._incrementUpdated(run);
    } else {
      if (run) await this._incrementCreated(run);
    }

    return item;
  }

  // Helpers para atualizar contadores do PipelineRun atomicamente

  async _incrementError(run) {
    await PipelineRun.increment('items_errored', { where: { id: run.id } });
  }

  async _incrementFound(run, count) {
    await PipelineRun.increment('items_found', { by: count, where: { id: run.id } });
  }

  async _incrementCreated(run) {
    await PipelineRun.increment('items_created', { where: { id: run.id } });
  }

  async _incrementUpdated(run) {
    await PipelineRun.increment('items_updated', { where: { id: run.id } });
  }

  /**
   * Cria um PipelineRun e executa o crawl completo de uma fonte.
   * Enfileira URLs iniciais com base na estrategia da fonte.
   */
  async runSource(sourceId, runType = 'full') {
    const source = await SearchableSource.findByPk(sourceId);
    if (!source) throw new Error(`SearchableSource ${sourceId} nao encontrada`);

    const run = await PipelineRun.create({
      source_id: sourceId,
      run_type: runType,
      status: 'running',
      started_at: new Date(),
    });

    logger.info(`PipelineRunner: iniciando run ${run.id} para fonte ${source.name}`);

    try {
      if (this._shouldUseCujubimPublicacoesCrawler(source)) {
        await this._runCujubimPublicacoes(source, run);
        return run;
      }

      const seedUrls = this._getSeedUrls(source);
      const visited = new Set();
      const queue = [...seedUrls];

      while (queue.length) {
        const currentRun = await PipelineRun.findByPk(run.id, { attributes: ['status'] });
        if (currentRun?.status === 'cancelled') {
          logger.info(`PipelineRunner: run ${run.id} cancelado`);
          return run;
        }

        const url = queue.shift();
        if (visited.has(url)) continue;
        visited.add(url);

        const { discoveredUrls } = await this.processUrl(url, source, run);

        const maxItems = source.max_items;
        if (!maxItems || visited.size < maxItems) {
          for (const discovered of discoveredUrls) {
            if (!visited.has(discovered)) queue.push(discovered);
          }
        }

        // Delay entre requests
        const delay = source.config_json?.delay_between_requests || 1000;
        if (delay > 0) await this._sleep(delay);
      }

      const finalRun = await PipelineRun.findByPk(run.id, { attributes: ['status'] });
      if (finalRun?.status !== 'cancelled') {
        await run.update({
          status: 'completed',
          finished_at: new Date(),
          duration_ms: Date.now() - run.started_at.getTime(),
        });
      }

      await source.update({ last_crawled_at: new Date() });
      logger.info(`PipelineRunner: run ${run.id} concluido`);
    } catch (err) {
      await run.update({
        status: 'failed',
        finished_at: new Date(),
        error_message: err.message,
      });
      logger.error(`PipelineRunner: run ${run.id} falhou: ${err.message}`);
      throw err;
    }

    return run;
  }

  _shouldUseCujubimPublicacoesCrawler(source) {
    const config = source.config_json || {};
    if (config.adapter === 'cujubim_publicacoes') return true;

    const url = String(source.base_url || '').toLowerCase();
    return (
      url.includes('transparencia.cujubim.ro.gov.br') &&
      url.includes('aplicacoes/publicacao/frmpublicacao')
    );
  }

  async _runCujubimPublicacoes(source, run) {
    const config = source.config_json || {};
    const crawler = new CujubimPublicacoesCrawler({
      logger,
      pageDelayMs: Number(config.delay_between_requests || 800),
      maxPages: config.max_catalog_pages || null,
      headless: true,
      shouldContinue: async () => {
        const currentRun = await PipelineRun.findByPk(run.id, { attributes: ['status'] });
        return currentRun?.status === 'running';
      },
    });

    const rawItems = await crawler.crawlCatalog();
    const maxItems = source.max_items || config.max_items || null;
    const selectedItems = maxItems ? rawItems.slice(0, maxItems) : rawItems;
    const persistedItems = [];

    for (const rawItem of selectedItems) {
      const extracted = await this._mapCujubimCatalogItem(rawItem, source);
      const contentItem = await this._persistItem(extracted, source, run);
      if (contentItem) persistedItems.push(contentItem);
    }

    if (persistedItems.length) {
      await this._incrementFound(run, persistedItems.length);
    }

    await run.update({
      status: 'completed',
      finished_at: new Date(),
      duration_ms: Date.now() - run.started_at.getTime(),
    });

    await source.update({ last_crawled_at: new Date() });
    logger.info(`PipelineRunner: run ${run.id} concluido via crawler Cujubim (${persistedItems.length} itens)`);
  }

  async _mapCujubimCatalogItem(item, source) {
    const extension = String(item.extension || 'PDF').toUpperCase();
    const titleParts = [item.tipo, item.numero_ano].filter(Boolean);
    const title = titleParts.length ? titleParts.join(' ') : (item.descricao || `Documento ${item.external_id}`);
    const metadataText = [
      title,
      item.descricao,
      item.ementa,
      item.data_documento ? `Data do documento: ${item.data_documento}` : '',
      item.data_publicacao ? `Data de publicacao: ${item.data_publicacao}` : '',
    ].filter(Boolean).join('\n\n');
    let extractedContent = null;
    let extractionError = null;

    if (item.download_url && source.config_json?.extract_document_text !== false) {
      try {
        extractedContent = await catalogDocumentContentService.extractFromDocumentUrl(item.download_url);
      } catch (err) {
        extractionError = err.message;
        logger.warn(`PipelineRunner: falha ao extrair texto do documento ${item.external_id}: ${err.message}`);
      }
    }

    const textContent = extractedContent?.text || metadataText;
    const markdownContent = extractedContent?.markdown || null;

    return {
      url: item.detalhe_url || item.download_url || source.base_url,
      canonicalUrl: item.detalhe_url || item.download_url || source.base_url,
      title,
      description: item.ementa || item.descricao || '',
      textContent,
      markdownContent,
      itemKind: extension === 'PDF' ? 'pdf' : 'official_document',
      documentType: item.tipo || '',
      documentNumber: item.numero_ano || item.external_id || '',
      publicationDate: item.data_publicacao || item.data_documento || '',
      fileUrl: item.download_url || '',
      fileExtension: extension,
      metadata: {
        externalId: item.external_id,
        sourceName: item.source_name || 'cujubim_transparencia_publicacoes',
        sourceUrl: source.base_url,
        detailUrl: item.detalhe_url || '',
        pageNumber: item.pagina_origem || null,
        rawText: item.metadata_json?.raw_text || item.raw_text || '',
        extractedTextLength: extractedContent?.textLength || 0,
        extractedBlocks: extractedContent?.blocks || [],
        hasContent: Boolean(extractedContent?.hasContent),
        extractionInfo: extractedContent?.info || null,
        extractionError,
      },
      discoveredUrls: [],
    };
  }

  _getSeedUrls(source) {
    const config = source.config_json || {};
    if (config.seed_urls?.length) return config.seed_urls;
    return [source.base_url];
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = PipelineRunner;
