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
  assert.equal(params.filter_by, 'source_id:99');
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
