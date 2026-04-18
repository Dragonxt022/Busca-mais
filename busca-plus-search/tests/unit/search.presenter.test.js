const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPagination,
  buildSearchUrl,
  buildTabs,
  SEARCH_TABS,
} = require('../../src/modules/search');

test('buildEmptyIndexViewModel returns baseline view state', () => {
  assert.deepEqual(buildEmptyIndexViewModel(), {
    hasQuery: false,
    imageCards: [],
    imageResults: null,
    page: 1,
    pagination: null,
    query: '',
    results: null,
    sidebar: null,
    source: null,
    statsLabel: null,
    tab: SEARCH_TABS.ALL,
    tabs: buildTabs({ tab: SEARCH_TABS.ALL }),
    totalHits: 0,
    totalPages: 0,
  });
});

test('buildIndexViewModel maps web results to render payload', () => {
  const viewModel = buildIndexViewModel({
    page: 2,
    query: 'licitacao',
    sourceId: '42',
    tab: SEARCH_TABS.ALL,
    results: {
      hits: [
        {
          id: '1',
          title: 'Licitacao aberta',
          sourceId: '42',
          sourceName: 'Portal Transparencia',
          detailUrl: '/page/1',
          openUrl: 'https://example.com/1',
          description: 'Resultado principal',
          recordType: 'page',
        },
        {
          id: '2',
          title: 'Edital 12/2026',
          sourceId: '42',
          sourceName: 'Portal Transparencia',
          detailUrl: '/page/catalog-2',
          openUrl: 'https://example.com/2.pdf',
          description: 'Documento catalogado',
          recordType: 'catalog_document',
          documentType: 'Edital',
        },
      ],
      found: 12,
    },
  });

  assert.equal(viewModel.query, 'licitacao');
  assert.equal(viewModel.results.length, 2);
  assert.equal(viewModel.results[0].detailUrl, '/page/1');
  assert.equal(viewModel.results[1].recordType, 'catalog_document');
  assert.equal(viewModel.imageResults, null);
  assert.equal(viewModel.imageCards.length, 0);
  assert.equal(viewModel.totalHits, 12);
  assert.equal(viewModel.page, 2);
  assert.equal(viewModel.totalPages, 2);
  assert.equal(viewModel.source, '42');
  assert.equal(viewModel.statsLabel, '12 resultados para "licitacao"');
  assert.equal(viewModel.pagination.previousUrl, '/?q=licitacao&source=42');
  assert.equal(viewModel.pagination.nextUrl, null);
  assert.equal(viewModel.sidebar.summary.totalHits, 12);
  assert.equal(viewModel.sidebar.summary.catalogCount, 1);
  assert.equal(viewModel.sidebar.topSources.length, 1);
  assert.equal(viewModel.sidebar.featuredResult.detailUrl, '/page/1');
});

test('buildIndexViewModel maps image results to render payload', () => {
  const viewModel = buildIndexViewModel({
    page: 1,
    query: 'foto',
    tab: SEARCH_TABS.IMAGES,
    results: {
      hits: [{
        id: 'img-1',
        url: 'https://example.com',
        domain: 'example.com',
        title: 'Imagem',
        images: [{ thumbnailPath: '/images/example.jpg', alt: 'Capa' }],
      }],
      found: 21,
    },
  });

  assert.equal(viewModel.results, null);
  assert.deepEqual(viewModel.imageResults, [{
    id: 'img-1',
    url: 'https://example.com',
    domain: 'example.com',
    title: 'Imagem',
    images: [{ thumbnailPath: '/images/example.jpg', alt: 'Capa' }],
  }]);
  assert.equal(viewModel.imageCards.length, 1);
  assert.equal(viewModel.totalPages, 2);
  assert.equal(viewModel.statsLabel, '21 imagens para "foto"');
  assert.equal(viewModel.sidebar, null);
});

test('buildSearchUrl omits default tab and first page', () => {
  assert.equal(buildSearchUrl({
    query: 'busca',
    page: 1,
    tab: SEARCH_TABS.ALL,
  }), '/?q=busca');
});

test('buildPagination returns null for single page result sets', () => {
  assert.equal(buildPagination({
    page: 1,
    totalPages: 1,
    query: 'busca',
    tab: SEARCH_TABS.ALL,
  }), null);
});
