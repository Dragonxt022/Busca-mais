const express = require('express');
const crypto = require('crypto');
const { Op } = require('sequelize');
const SearchableSource = require('../models/searchable-source.model');
const ContentItem = require('../models/content-item.model');
const PipelineRun = require('../models/pipeline-run.model');
const contentIndexer = require('../content-indexer');
const { pipelineQueue, pipelineIndexQueue } = require('../../../workers/pipeline.worker');
const { parseBoolean, parseCsv, parseNullableInt, serializeCsv } = require('../../../utils/csv');

const router = express.Router();

const VALID_ITEM_KINDS = ['page', 'news', 'official_document', 'pdf', 'protocol', 'attachment', 'listing_item', 'other'];

function normalizeItemKind(value) {
  if (!value || value === 'undefined' || value === 'null') return 'page';
  return VALID_ITEM_KINDS.includes(value) ? value : 'page';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 180);
}


function hashUrl(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSourcePayload(row = {}) {
  return {
    name: String(row.name || '').trim(),
    slug: String(row.slug || slugify(row.name || row.base_url)).trim(),
    base_url: String(row.base_url || row.url || '').trim(),
    source_kind: row.source_kind || 'institutional_site',
    crawl_strategy: row.crawl_strategy || 'web_crawl',
    state: row.state ? String(row.state).trim().toUpperCase() : null,
    city: row.city ? String(row.city).trim() : null,
    is_active: parseBoolean(row.is_active, true),
    schedule: row.schedule || null,
    max_items: parseNullableInt(row.max_items, null),
    config_json: parseJson(row.config_json, {}),
  };
}

async function clearEngineData({ includeSources = false } = {}) {
  await ContentItem.destroy({ where: {} });
  await PipelineRun.destroy({ where: {} });
  if (includeSources) {
    await SearchableSource.destroy({ where: {} });
  }
}

function importMode(req) {
  return req.body.import_mode === 'replace' ? 'replace' : 'merge';
}
// SearchableSource CRUD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/sources', async (req, res) => {
  const { page = 1, limit = 20, source_kind, is_active, q } = req.query;
  const where = {};

  if (source_kind) where.source_kind = source_kind;
  if (is_active !== undefined) where.is_active = is_active === 'true';
  if (q) where.name = { [Op.iLike]: `%${q}%` };

  const { count, rows } = await SearchableSource.findAndCountAll({
    where,
    limit: Math.min(Number(limit), 100),
    offset: (Number(page) - 1) * Number(limit),
    order: [['created_at', 'DESC']],
  });

  res.json({ total: count, page: Number(page), data: rows });
});


router.get('/export.csv', async (req, res) => {
  try {
    const mode = req.query.mode || 'sources';

    if (mode === 'items' || mode === 'full') {
      const items = await ContentItem.findAll({
        include: [{ model: SearchableSource, as: 'searchableSource' }],
        order: [['created_at', 'DESC']],
      });
      const columns = [
        { key: 'id', getter: (row) => row.id },
        { key: 'source_id', getter: (row) => row.source_id },
        { key: 'source_slug', getter: (row) => row.searchableSource?.slug || '' },
        { key: 'source_name', getter: (row) => row.searchableSource?.name || '' },
        { key: 'source_base_url', getter: (row) => row.searchableSource?.base_url || '' },
        { key: 'url', getter: (row) => row.url || '' },
        { key: 'canonical_url', getter: (row) => row.canonical_url || '' },
        { key: 'title', getter: (row) => row.title || '' },
        { key: 'description', getter: (row) => row.description || '' },
        { key: 'item_kind', getter: (row) => row.item_kind || '' },
        { key: 'document_type', getter: (row) => row.document_type || '' },
        { key: 'document_number', getter: (row) => row.document_number || '' },
        { key: 'publication_date', getter: (row) => row.publication_date || '' },
        { key: 'department', getter: (row) => row.department || '' },
        { key: 'file_url', getter: (row) => row.file_url || '' },
        { key: 'file_extension', getter: (row) => row.file_extension || '' },
        { key: 'content_hash', getter: (row) => row.content_hash || '' },
        { key: 'url_hash', getter: (row) => row.url_hash || '' },
        { key: 'status', getter: (row) => row.status || '' },
        { key: 'metadata_json', getter: (row) => JSON.stringify(row.metadata_json || {}) },
        { key: 'images_json', getter: (row) => JSON.stringify(row.images_json || []) },
      ];

      if (mode === 'full') {
        columns.push(
          { key: 'text_content', getter: (row) => row.text_content || '' },
          { key: 'markdown_content', getter: (row) => row.markdown_content || '' },
        );
      }

      const csv = serializeCsv(items, columns);
      const filename = mode === 'full' ? 'motor-itens-completo.csv' : 'motor-itens.csv';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(`\uFEFF${csv}`);
    }

    const sources = await SearchableSource.findAll({ order: [['created_at', 'DESC']] });
    const csv = serializeCsv(sources, [
      { key: 'id', getter: (row) => row.id },
      { key: 'name', getter: (row) => row.name },
      { key: 'slug', getter: (row) => row.slug },
      { key: 'base_url', getter: (row) => row.base_url },
      { key: 'source_kind', getter: (row) => row.source_kind },
      { key: 'crawl_strategy', getter: (row) => row.crawl_strategy },
      { key: 'state', getter: (row) => row.state || '' },
      { key: 'city', getter: (row) => row.city || '' },
      { key: 'is_active', getter: (row) => row.is_active },
      { key: 'schedule', getter: (row) => row.schedule || '' },
      { key: 'max_items', getter: (row) => row.max_items || '' },
      { key: 'config_json', getter: (row) => JSON.stringify(row.config_json || {}) },
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="motor-fontes.csv"');
    return res.send(`\uFEFF${csv}`);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const rows = parseCsv(req.body.csv_text || '');
    if (rows.length === 0) return res.status(400).json({ error: 'CSV vazio ou invalido' });

    const mode = importMode(req);
    const type = req.body.import_type === 'items' ? 'items' : 'sources';
    if (mode === 'replace') await clearEngineData({ includeSources: true });

    let created = 0;
    let updated = 0;
    let skipped = 0;

    if (type === 'sources') {
      for (const row of rows) {
        const payload = normalizeSourcePayload(row);
        if (!payload.name || !payload.slug || !payload.base_url) {
          skipped += 1;
          continue;
        }

        const existing = await SearchableSource.findOne({
          where: { [Op.or]: [{ slug: payload.slug }, { base_url: payload.base_url }] },
        });

        if (existing) {
          await existing.update(payload);
          updated += 1;
        } else {
          await SearchableSource.create(payload);
          created += 1;
        }
      }

      return res.json({ mode, type, created, updated, skipped, total: created + updated });
    }

    const sourceCache = new Map();
    for (const row of rows) {
      const url = String(row.url || '').trim();
      if (!url) {
        skipped += 1;
        continue;
      }

      const sourceKey = row.source_slug || row.source_base_url || row.source_id || row.source_name || 'imported';
      let source = sourceCache.get(sourceKey);
      if (!source) {
        source = row.source_slug ? await SearchableSource.findOne({ where: { slug: row.source_slug } }) : null;
        if (!source && row.source_base_url) {
          source = await SearchableSource.findOne({ where: { base_url: row.source_base_url } });
        }
        if (!source) {
          source = await SearchableSource.create({
            name: row.source_name || row.source_slug || row.source_base_url || 'Fonte importada',
            slug: row.source_slug || slugify(row.source_name || row.source_base_url || `import-${Date.now()}`),
            base_url: row.source_base_url || url,
            source_kind: 'other',
            crawl_strategy: 'manual_url',
            is_active: true,
            config_json: {},
          });
        }
        sourceCache.set(sourceKey, source);
      }

      const payload = {
        source_id: source.id,
        url,
        canonical_url: row.canonical_url || null,
        title: row.title || null,
        description: row.description || null,
        text_content: row.text_content || null,
        markdown_content: row.markdown_content || null,
        item_kind: normalizeItemKind(row.item_kind),
        document_type: row.document_type || null,
        document_number: row.document_number || null,
        publication_date: row.publication_date || null,
        department: row.department || null,
        file_url: row.file_url || null,
        file_extension: row.file_extension || null,
        content_hash: row.content_hash || null,
        url_hash: row.url_hash || hashUrl(url),
        images_json: parseJson(row.images_json, []),
        metadata_json: parseJson(row.metadata_json, {}),
        status: ['pending', 'indexed', 'error'].includes(row.status) ? row.status : 'pending',
      };

      const existing = await ContentItem.findOne({ where: { url_hash: payload.url_hash } });
      if (existing) {
        await existing.update(payload);
        updated += 1;
      } else {
        await ContentItem.create(payload);
        created += 1;
      }
    }

    return res.json({ mode, type, created, updated, skipped, total: created + updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
router.get('/sources/:id', async (req, res) => {
  const source = await SearchableSource.findByPk(req.params.id);
  if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });
  res.json(source);
});

router.post('/sources', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (!payload.slug) {
      payload.slug = slugify(payload.name || payload.base_url);
    }
    const source = await SearchableSource.create(payload);
    res.status(201).json(source);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/sources/:id', async (req, res) => {
  const source = await SearchableSource.findByPk(req.params.id);
  if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });
  try {
    await source.update(req.body);
    res.json(source);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/sources/:id', async (req, res) => {
  const source = await SearchableSource.findByPk(req.params.id);
  if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });
  await source.destroy();
  res.json({ ok: true });
});

// â”€â”€â”€ Pipeline Run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/sources/:id/run', async (req, res) => {
  const source = await SearchableSource.findByPk(req.params.id);
  if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });

  const job = await pipelineQueue.add('run_source', {
    type: 'run_source',
    sourceId: source.id,
    runType: req.body.run_type || 'full',
  });

  res.json({ ok: true, jobId: job.id, sourceId: source.id });
});

router.post('/sources/:id/resume-indexing', async (req, res) => {
  const source = await SearchableSource.findByPk(req.params.id);
  if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });

  let total = 0;
  let offset = 0;
  const batchSize = 500;

  while (true) {
    const batch = await ContentItem.findAll({
      where: { source_id: source.id, status: 'pending' },
      attributes: ['id'],
      order: [['id', 'ASC']],
      limit: batchSize,
      offset,
    });

    if (!batch.length) break;

    for (const item of batch) {
      await pipelineIndexQueue.add('index_item', { itemId: item.id }, { priority: 2 });
    }

    total += batch.length;
    if (batch.length < batchSize) break;
    offset += batchSize;
  }

  res.json({ ok: true, queued: total, sourceId: source.id });
});

router.get('/sources/:id/runs', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { count, rows } = await PipelineRun.findAndCountAll({
    where: { source_id: req.params.id },
    limit: Math.min(Number(limit), 100),
    offset: (Number(page) - 1) * Number(limit),
    order: [['created_at', 'DESC']],
  });
  res.json({ total: count, page: Number(page), data: rows });
});

router.post('/runs/:id/cancel', async (req, res) => {
  const run = await PipelineRun.findByPk(req.params.id);
  if (!run) return res.status(404).json({ error: 'Execucao nao encontrada' });

  if (!['pending', 'running'].includes(run.status)) {
    return res.status(400).json({ error: 'Execucao ja finalizada' });
  }

  await run.update({
    status: 'cancelled',
    finished_at: new Date(),
    error_message: null,
  });

  res.json({ ok: true, run });
});

router.delete('/runs/:id', async (req, res) => {
  const run = await PipelineRun.findByPk(req.params.id);
  if (!run) return res.status(404).json({ error: 'Execucao nao encontrada' });

  if (run.status === 'running') {
    return res.status(400).json({ error: 'Cancele a execucao antes de excluir' });
  }

  await run.destroy();
  res.json({ ok: true });
});

router.post('/runs/clean-finished', async (req, res) => {
  const deleted = await PipelineRun.destroy({
    where: {
      status: { [Op.in]: ['completed', 'failed', 'cancelled'] },
    },
  });

  res.json({ ok: true, deleted });
});

router.post('/sources/:id/pause-schedule', async (req, res) => {
  const source = await SearchableSource.findByPk(req.params.id);
  if (!source) return res.status(404).json({ error: 'Fonte nao encontrada' });

  await source.update({ schedule: null });
  res.json({ ok: true, source });
});

// â”€â”€â”€ ContentItem â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/content-items', async (req, res) => {
  const { page = 1, limit = 20, source_id, item_kind, status, q } = req.query;
  const where = {};

  if (source_id) where.source_id = source_id;
  if (item_kind && VALID_ITEM_KINDS.includes(item_kind)) where.item_kind = item_kind;
  if (status) where.status = status;
  if (q) where.title = { [Op.iLike]: `%${q}%` };

  const { count, rows } = await ContentItem.findAndCountAll({
    where,
    limit: Math.min(Number(limit), 100),
    offset: (Number(page) - 1) * Number(limit),
    order: [['last_crawled_at', 'DESC']],
    include: [{ model: SearchableSource, as: 'searchableSource', attributes: ['id', 'name', 'source_kind'] }],
  });

  res.json({ total: count, page: Number(page), data: rows });
});

router.get('/content-items/:id', async (req, res) => {
  const item = await ContentItem.findByPk(req.params.id, {
    include: [{ model: SearchableSource, as: 'searchableSource' }],
  });
  if (!item) return res.status(404).json({ error: 'Item nao encontrado' });
  res.json(item);
});

router.post('/content-items/:id/index', async (req, res) => {
  const item = await ContentItem.findByPk(req.params.id, {
    include: [{ model: SearchableSource, as: 'searchableSource' }],
  });
  if (!item) return res.status(404).json({ error: 'Item nao encontrado' });

  const success = await contentIndexer.indexItem(item, item.searchableSource);
  res.json({ ok: success, id: `ci-${item.id}` });
});

router.delete('/content-items/:id', async (req, res) => {
  const item = await ContentItem.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item nao encontrado' });
  await contentIndexer.deleteItem(item.id);
  await item.destroy();
  res.json({ ok: true });
});

// â”€â”€â”€ Estatisticas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/stats', async (req, res) => {
  const [totalSources, activeSources, totalItems, indexedItems, pendingItems] = await Promise.all([
    SearchableSource.count(),
    SearchableSource.count({ where: { is_active: true } }),
    ContentItem.count(),
    ContentItem.count({ where: { status: 'indexed' } }),
    ContentItem.count({ where: { status: 'pending' } }),
  ]);

  const byKind = await ContentItem.findAll({
    attributes: ['item_kind', [ContentItem.sequelize.fn('COUNT', ContentItem.sequelize.col('id')), 'count']],
    group: ['item_kind'],
    raw: true,
  });

  res.json({ totalSources, activeSources, totalItems, indexedItems, pendingItems, byKind });
});

module.exports = router;

