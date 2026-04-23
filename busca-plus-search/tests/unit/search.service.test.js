const test = require('node:test');
const assert = require('node:assert/strict');

const SearchService = require('../../src/modules/search/search.service');

test('SearchService.buildSearchParams applies source filter and paging', () => {
  const service = new SearchService();

  const params = service.buildSearchParams({
    query: 'contrato',
    page: '3',
    perPage: 10,
    sourceId: '99',
  });

  assert.equal(params.q, 'contrato');
  assert.equal(params.page, 3);
  assert.equal(params.per_page, 10);
  assert.equal(params.filter_by, 'source_id:=99');
  assert.equal(params.sort_by, '_text_match:desc,crawled_at:desc');
});

test('SearchService.buildImageSearchParams forces image filter', () => {
  const service = new SearchService();

  const params = service.buildImageSearchParams({
    query: 'obra',
    page: '2',
    sourceId: null,
  });

  assert.equal(params.page, 2);
  assert.equal(params.filter_by, 'has_images:true');
  assert.equal(params.per_page, 20);
});

test('SearchService.formatImageHit normalizes image payload', () => {
  const service = new SearchService();

  const payload = service.formatImageHit({
    text_match: 77,
    document: {
      id: '1',
      url: 'https://example.com',
      title: 'Portal',
      description: 'Descricao',
      domain: 'example.com',
      source_id: '10',
      source_name: 'Fonte',
      images: ['images/a.jpg'],
      image_thumbnails: ['thumbs/a.jpg'],
      image_alts: ['Imagem principal'],
      crawled_at: '2026-04-16T00:00:00.000Z',
    },
  });

  assert.deepEqual(payload.images, [{
    localPath: 'images/a.jpg',
    thumbnailPath: 'thumbs/a.jpg',
    alt: 'Imagem principal',
    width: 0,
    height: 0,
  }]);
  assert.equal(payload.score, 77);
  assert.equal(payload.sourceName, 'Fonte');
});

test('SearchService.generateSummary prefers complete sentences over raw truncation', () => {
  const service = new SearchService();
  const summary = service.generateSummary(
    'A Prefeitura de Cujubim realizou uma reuniao com a Policia Militar para definir medidas de seguranca nas escolas. Durante o encontro, foram apresentados protocolos preventivos e cronogramas de visitas tecnicas. Menu principal noticias contato.'
  );

  assert.match(summary, /A Prefeitura de Cujubim realizou uma reuniao/);
  assert.doesNotMatch(summary, /Menu principal/);
});

test('SearchService.formatHit uses internal detail page for catalog and regular pages', () => {
  const service = new SearchService();

  const pageHit = service.formatHit({
    document: {
      id: '123',
      url: 'https://example.com/noticia',
      title: 'Noticia',
      content: 'Conteudo',
      record_type: 'page',
    },
  }, 'seguranca escolar');

  const catalogHit = service.formatHit({
    document: {
      id: 'catalog-55',
      url: 'https://example.com/arquivo.pdf',
      title: 'Lei 55',
      description: 'Descricao',
      record_type: 'catalog_document',
      download_url: 'https://example.com/arquivo.pdf',
    },
  }, 'lei');

  assert.match(pageHit.detailUrl, /^\/page\/123\?q=seguranca\+escolar&focus=/);
  assert.match(catalogHit.detailUrl, /^\/page\/catalog-55\?q=lei&focus=/);
  assert.equal(pageHit.matchSnippetHtml, 'Conteudo');
  assert.equal(pageHit.focusText, 'Conteudo');
});

test('SearchService.isRecoverableSearchError recognizes schema and connectivity issues', () => {
  const service = new SearchService();

  assert.equal(service.isRecoverableSearchError({ message: 'Could not find a field named `source_state` in the schema.' }), true);
  assert.equal(service.isRecoverableSearchError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:8108' }), true);
  assert.equal(service.isRecoverableSearchError({ httpStatus: 503, message: 'Service Unavailable' }), true);
  assert.equal(service.isRecoverableSearchError({ httpStatus: 400, message: 'validation failed' }), false);
});

test('SearchService.createEmptySearchResult normalizes empty search payload', () => {
  const service = new SearchService();
  const payload = service.createEmptySearchResult('3', 20);

  assert.deepEqual(payload, {
    hits: [],
    found: 0,
    page: 3,
    perPage: 20,
    facets: [],
  });
});
