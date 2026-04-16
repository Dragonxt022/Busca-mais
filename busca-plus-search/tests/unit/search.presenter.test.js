const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  SEARCH_TABS,
} = require('../../src/modules/search');

test('buildEmptyIndexViewModel returns baseline view state', () => {
  assert.deepEqual(buildEmptyIndexViewModel(), {
    query: '',
    results: null,
    imageResults: null,
    totalHits: 0,
    page: 1,
    totalPages: 0,
    source: null,
    tab: SEARCH_TABS.ALL,
  });
});

test('buildIndexViewModel maps web results to render payload', () => {
  const viewModel = buildIndexViewModel({
    page: 2,
    query: 'licitacao',
    sourceId: '42',
    tab: SEARCH_TABS.ALL,
    results: {
      hits: [{ id: '1' }, { id: '2' }],
      found: 12,
    },
  });

  assert.equal(viewModel.query, 'licitacao');
  assert.deepEqual(viewModel.results, [{ id: '1' }, { id: '2' }]);
  assert.equal(viewModel.imageResults, null);
  assert.equal(viewModel.totalHits, 12);
  assert.equal(viewModel.page, 2);
  assert.equal(viewModel.totalPages, 2);
  assert.equal(viewModel.source, '42');
});

test('buildIndexViewModel maps image results to render payload', () => {
  const viewModel = buildIndexViewModel({
    page: 1,
    query: 'foto',
    tab: SEARCH_TABS.IMAGES,
    results: {
      hits: [{ id: 'img-1' }],
      found: 21,
    },
  });

  assert.equal(viewModel.results, null);
  assert.deepEqual(viewModel.imageResults, [{ id: 'img-1' }]);
  assert.equal(viewModel.totalPages, 2);
});
