const axios = require('axios');
const crypto = require('crypto');
const { Op } = require('sequelize');

const aiSettingsService = require('../../services/ai-settings.service');
const { ContentItem, ContentChunk, AiSearchSummary, SearchableSource } = require('../../models');
const { logger } = require('../../libs/logger');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

class AiRetrievalService {
  constructor({ http = axios, settingsService = aiSettingsService } = {}) {
    this.http = http;
    this.settingsService = settingsService;
  }

  getSettings() {
    return this.settingsService.getSettings();
  }

  ensureEnabled(feature) {
    const settings = this.getSettings();
    if (!settings.enabled) throw new Error('IA desativada nas configuracoes.');
    if (feature && !settings.features?.[feature]) {
      throw new Error(`Recurso de IA desativado: ${feature}.`);
    }
    return settings;
  }

  splitText(text, { chunkCharacters = 1800, chunkOverlap = 250 } = {}) {
    const clean = normalizeWhitespace(text);
    if (!clean) return [];

    const chunks = [];
    let start = 0;
    while (start < clean.length) {
      let end = Math.min(clean.length, start + chunkCharacters);
      if (end < clean.length) {
        const lastBreak = Math.max(
          clean.lastIndexOf('. ', end),
          clean.lastIndexOf('; ', end),
          clean.lastIndexOf(' ', end - Math.floor(chunkCharacters * 0.15))
        );
        if (lastBreak > start + Math.floor(chunkCharacters * 0.45)) {
          end = lastBreak + 1;
        }
      }

      const chunk = clean.slice(start, end).trim();
      if (chunk.length >= 120) chunks.push(chunk);
      if (end >= clean.length) break;
      start = Math.max(0, end - chunkOverlap);
    }

    return chunks;
  }

  async embedText(text, settings = this.getSettings()) {
    const provider = settings.embeddings?.provider || 'ollama';
    if (provider !== 'ollama') {
      throw new Error(`Provedor de embedding nao suportado: ${provider}`);
    }

    const baseUrl = String(settings.ollama?.baseUrl || '').replace(/\/$/, '');
    const model = settings.embeddings?.model || 'nomic-embed-text';
    if (!baseUrl) throw new Error('Base URL do Ollama nao configurada.');
    if (!model) throw new Error('Modelo de embedding nao configurado.');

    let response;
    try {
      response = await this.http.post(`${baseUrl}/api/embeddings`, { model, prompt: text }, { timeout: 120000 });
    } catch (firstErr) {
      const status = firstErr?.response?.status;
      if (status !== 404) {
        const ollamaMsg = firstErr?.response?.data?.error || firstErr.message;
        throw new Error(`Ollama /api/embeddings falhou (${status || 'sem resposta'}): ${ollamaMsg}`);
      }
      try {
        response = await this.http.post(`${baseUrl}/api/embed`, { model, input: text }, { timeout: 120000 });
      } catch (secondErr) {
        const s = secondErr?.response?.status;
        const ollamaMsg = secondErr?.response?.data?.error || secondErr.message;
        throw new Error(`Ollama /api/embed falhou (${s || 'sem resposta'}): ${ollamaMsg}`);
      }
    }

    const vector = response.data?.embedding || response.data?.embeddings?.[0];
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('Ollama nao retornou embedding valido. Verifique o nome do modelo nas configuracoes de IA.');
    }

    return vector.map((value) => Number(value));
  }

  async rebuildChunksForItem(item, settings = this.getSettings()) {
    const sourceId = item.source_id || null;
    const baseText = item.text_content || item.markdown_content || item.description || '';
    const chunks = this.splitText(baseText, settings.embeddings || {});

    await ContentChunk.destroy({ where: { content_item_id: item.id } });

    const rows = chunks.map((text, index) => ({
      content_item_id: item.id,
      source_id: sourceId,
      chunk_index: index,
      text,
      text_hash: sha256(text),
      token_count: Math.ceil(text.length / 4),
      status: settings.features?.embeddings ? 'pending' : 'skipped',
      metadata_json: {
        title: item.title || '',
        documentType: item.document_type || '',
        documentNumber: item.document_number || '',
        publicationDate: item.publication_date || null,
        fileUrl: item.file_url || '',
        url: item.url || '',
      },
    }));

    if (rows.length) {
      await ContentChunk.bulkCreate(rows);
    }

    return rows.length;
  }

  async processItem(itemId, { force = false } = {}) {
    const settings = this.ensureEnabled('embeddings');
    const item = await ContentItem.findByPk(itemId);
    if (!item) throw new Error(`ContentItem ${itemId} nao encontrado.`);

    const existingCount = await ContentChunk.count({ where: { content_item_id: item.id } });
    if (force || existingCount === 0) {
      await this.rebuildChunksForItem(item, settings);
    }

    const pending = await ContentChunk.findAll({
      where: {
        content_item_id: item.id,
        [Op.or]: [
          { status: 'pending' },
          { embedding_json: null },
        ],
      },
      order: [['chunk_index', 'ASC']],
    });

    let embedded = 0;
    let failed = 0;
    for (const chunk of pending) {
      try {
        const vector = await this.embedText(chunk.text, settings);
        await chunk.update({
          embedding_provider: settings.embeddings.provider,
          embedding_model: settings.embeddings.model,
          embedding_json: vector,
          embedded_at: new Date(),
          status: 'embedded',
          error_message: null,
        });
        embedded += 1;
      } catch (error) {
        await chunk.update({ status: 'error', error_message: error.message });
        failed += 1;
      }
    }

    return { itemId: item.id, chunks: existingCount || pending.length, embedded, failed };
  }

  async processPending({ limit = null, force = false } = {}) {
    const settings = this.ensureEnabled('embeddings');
    const max = Math.min(Number(limit || settings.embeddings?.batchLimit || 50), 500);
    const where = {
      status: 'indexed',
      text_content: { [Op.ne]: null },
    };

    const items = await ContentItem.findAll({
      where,
      order: [['updated_at', 'DESC']],
      limit: max,
      include: [{ model: ContentChunk, as: 'chunks', required: false, attributes: ['id', 'status'] }],
    });

    const selected = force
      ? items
      : items.filter((item) => !item.chunks?.length || item.chunks.some((chunk) => chunk.status !== 'embedded'));

    const results = [];
    for (const item of selected.slice(0, max)) {
      results.push(await this.processItem(item.id, { force }));
    }

    return {
      requested: max,
      processed: results.length,
      embedded: results.reduce((sum, row) => sum + row.embedded, 0),
      failed: results.reduce((sum, row) => sum + row.failed, 0),
      results,
    };
  }

  async getStats() {
    const [chunksTotal, embedded, pending, errors, itemsWithChunks, itemsIndexed] = await Promise.all([
      ContentChunk.count(),
      ContentChunk.count({ where: { status: 'embedded' } }),
      ContentChunk.count({ where: { status: 'pending' } }),
      ContentChunk.count({ where: { status: 'error' } }),
      ContentChunk.count({ distinct: true, col: 'content_item_id' }),
      ContentItem.count({ where: { status: 'indexed' } }),
    ]);

    const lastChunk = await ContentChunk.findOne({ order: [['updated_at', 'DESC']] });

    return {
      chunksTotal,
      embedded,
      pending,
      errors,
      itemsWithChunks,
      itemsIndexed,
      itemsWithoutChunks: Math.max(0, itemsIndexed - itemsWithChunks),
      lastProcessedAt: lastChunk?.updated_at || null,
      settings: this.getSettings(),
    };
  }

  buildQueryHash(query, filters = {}) {
    return sha256(JSON.stringify({
      query: normalizeWhitespace(query).toLowerCase(),
      state: filters.state || null,
      city: filters.city || null,
      sourceId: filters.sourceId || null,
    }));
  }

  async retrieveChunks(query, filters = {}, settings = this.getSettings()) {
    const queryVector = await this.embedText(query, settings);
    const where = { status: 'embedded' };
    if (filters.sourceId) where.source_id = Number(filters.sourceId);

    const chunks = await ContentChunk.findAll({
      where,
      include: [
        {
          model: ContentItem,
          as: 'contentItem',
          required: true,
          include: [{ model: SearchableSource, as: 'searchableSource' }],
        },
      ],
      order: [['updated_at', 'DESC']],
      limit: 2000,
    });

    const state = filters.state ? String(filters.state).toUpperCase() : null;
    const city = filters.city ? String(filters.city).toLowerCase() : null;

    return chunks
      .filter((chunk) => {
        const source = chunk.contentItem?.searchableSource;
        if (state && source?.state !== state) return false;
        if (city && String(source?.city || '').toLowerCase() !== city) return false;
        return Array.isArray(chunk.embedding_json);
      })
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryVector, chunk.embedding_json),
      }))
      .filter((row) => row.score >= (settings.searchOverview?.minScore ?? 0.12))
      .sort((a, b) => b.score - a.score)
      .slice(0, settings.searchOverview?.maxChunks || 8);
  }

  buildOverviewPrompt(query, retrieved) {
    const sources = retrieved.map(({ chunk, score }, index) => {
      const item = chunk.contentItem;
      const source = item?.searchableSource;
      return [
        `Fonte ${index + 1} (score ${score.toFixed(3)}):`,
        `Titulo: ${item?.title || 'Sem titulo'}`,
        `Origem: ${source?.name || ''}`,
        `Tipo: ${item?.document_type || item?.item_kind || ''}`,
        `Data: ${item?.publication_date || ''}`,
        `URL: ${item?.file_url || item?.url || ''}`,
        `Trecho: ${chunk.text}`,
      ].join('\n');
    }).join('\n\n');

    return [
      'Voce e um assistente de busca para documentos publicos brasileiros.',
      'Crie uma visao geral curta e objetiva para aparecer no topo dos resultados.',
      'Use somente os trechos fornecidos. Nao invente dados ausentes.',
      'Quando houver valores, numeros de contrato, datas ou orgaos, cite-os.',
      'Responda em portugues do Brasil, em 1 paragrafo curto seguido de ate 4 bullets se forem uteis.',
      `Pesquisa do usuario: ${query}`,
      '',
      'Trechos recuperados:',
      sources || 'Nenhum trecho recuperado.',
    ].join('\n');
  }

  async generateText(prompt, settings) {
    const provider = settings.provider || 'ollama';
    if (provider !== 'ollama') {
      throw new Error('Resumo de busca vetorial nesta versao usa Ollama como provedor de geracao.');
    }

    const baseUrl = String(settings.ollama?.baseUrl || '').replace(/\/$/, '');
    const model = settings.ollama?.model;
    const response = await this.http.post(`${baseUrl}/api/generate`, {
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2, num_predict: 420 },
    }, { timeout: 120000 });

    const text = String(response.data?.response || '').trim();
    if (!text) throw new Error('Ollama retornou resumo vazio.');
    return { provider, model, summary: text };
  }

  async generateSearchOverview(query, filters = {}) {
    const settings = this.ensureEnabled('searchOverview');
    if (!settings.features?.embeddings) {
      throw new Error('Embeddings precisam estar ativos para gerar visao geral de busca.');
    }

    const queryHash = this.buildQueryHash(query, filters);
    const now = new Date();
    const cached = await AiSearchSummary.findOne({ where: { query_hash: queryHash } });
    if (cached && cached.expires_at && cached.expires_at > now) {
      return {
        summary: cached.summary_text,
        sources: cached.sources_json || [],
        provider: cached.provider,
        model: cached.model,
        cached: true,
      };
    }

    const retrieved = await this.retrieveChunks(query, filters, settings);
    if (!retrieved.length) {
      throw new Error('Nao ha embeddings relevantes suficientes para esta pesquisa.');
    }

    const generated = await this.generateText(this.buildOverviewPrompt(query, retrieved), settings);
    const sources = retrieved.map(({ chunk, score }) => {
      const item = chunk.contentItem;
      const source = item?.searchableSource;
      return {
        id: `ci-${item.id}`,
        title: item.title,
        sourceName: source?.name || '',
        documentType: item.document_type || '',
        publicationDate: item.publication_date || null,
        url: item.file_url || item.url,
        score,
      };
    });

    const cacheMinutes = Number(settings.searchOverview?.cacheMinutes || 0);
    const expiresAt = cacheMinutes > 0 ? new Date(Date.now() + cacheMinutes * 60000) : null;
    await AiSearchSummary.upsert({
      query_hash: queryHash,
      query,
      filters_json: filters,
      result_signature: sha256(sources.map((source) => source.id).join('|')),
      summary_text: generated.summary,
      sources_json: sources,
      provider: generated.provider,
      model: generated.model,
      expires_at: expiresAt,
    });

    return { ...generated, sources, cached: false };
  }

  async clearSummaryCache() {
    return AiSearchSummary.destroy({ where: {} });
  }
}

const aiRetrievalService = new AiRetrievalService();

module.exports = aiRetrievalService;
module.exports.AiRetrievalService = AiRetrievalService;
