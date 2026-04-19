const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPagination,
  buildSearchUrl,
  buildTabs,
  buildSponsoredExperience,
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
    sponsored: null,
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
    sponsors: [
      {
        id: 11,
        name: 'Portal Licitacoes Premium',
        url: 'https://ads.example.com/premium',
        description: 'Acompanhe licitacoes e contratos em tempo real',
        images: ['https://ads.example.com/thumb.jpg'],
      },
      {
        id: 12,
        name: 'Consultoria Editais',
        url: 'https://ads.example.com/consultoria',
        description: 'Equipe para leitura de editais e preparo de documentos',
      },
    ],
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
  assert.equal(viewModel.sponsored.slots.top.length, 2);
  assert.equal(viewModel.sponsored.visibleCount, 2);
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
  assert.equal(viewModel.sponsored, null);
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

test('buildSponsoredExperience applies slot policy and keeps inventory compact', () => {
  const sponsored = buildSponsoredExperience({
    query: 'licitacao',
    page: 1,
    results: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    sponsors: [
      { id: 1, name: 'Radar Licitacao', url: 'https://a.example.com', description: 'Licitacao diaria' },
      { id: 2, name: 'Editais Brasil', url: 'https://b.example.com', description: 'Busca de edital' },
      { id: 3, name: 'Compras Publicas', url: 'https://c.example.com', description: 'Portal de compras' },
      { id: 4, name: 'Gestao de Contratos', url: 'https://d.example.com', description: 'Apoio juridico' },
      { id: 5, name: 'Analise de Propostas', url: 'https://e.example.com', description: 'Equipe especializada' },
      { id: 6, name: 'Capacitacao', url: 'https://f.example.com', description: 'Treinamento para disputa' },
    ],
  });

  assert.equal(sponsored.totalEligible, 6);
  assert.equal(sponsored.visibleCount, 5);
  assert.equal(sponsored.hiddenCount, 1);
  assert.equal(sponsored.slots.top.length, 2);
  assert.equal(sponsored.slots.inline.length, 1);
  assert.equal(sponsored.slots.inline[0].insertAfter, 3);
  assert.equal(sponsored.slots.sidebar.length, 2);
});
