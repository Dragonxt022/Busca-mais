const test = require('node:test');
const assert = require('node:assert/strict');

const { SearchController } = require('../../src/api/controllers/search.controller');

const createResponse = () => {
  const state = {};

  return {
    state,
    status(code) {
      state.status = code;
      return this;
    },
    json(payload) {
      state.json = payload;
      return payload;
    },
    render(view, payload) {
      state.render = { view, payload };
      return payload;
    },
  };
};

test('SearchController.index renders empty state when query is missing', async () => {
  const controller = new SearchController({
    searchService: {
      search: async () => {
        throw new Error('search should not be called');
      },
    },
  });
  const res = createResponse();

  await controller.index({ query: {} }, res, (error) => {
    throw error;
  });

  assert.equal(res.state.render.view, 'index');
  assert.equal(res.state.render.payload.query, '');
  assert.equal(res.state.render.payload.totalHits, 0);
});

test('SearchController.index renders image payload from service', async () => {
  const calls = [];
  const controller = new SearchController({
    searchService: {
      searchImages: async (query, page, sourceId) => {
        calls.push({ query, page, sourceId });
        return {
          hits: [{ id: 'img-1' }],
          found: 21,
        };
      },
      search: async () => {
        throw new Error('web search should not be called');
      },
    },
  });
  const res = createResponse();

  await controller.index({
    query: {
      q: 'portal',
      page: '2',
      source: 'abc',
      tab: 'images',
    },
  }, res, (error) => {
    throw error;
  });

  assert.deepEqual(calls, [{ query: 'portal', page: 2, sourceId: 'abc' }]);
  assert.equal(res.state.render.view, 'index');
  assert.deepEqual(res.state.render.payload.imageResults, [{ id: 'img-1' }]);
  assert.equal(res.state.render.payload.totalPages, 2);
});

test('SearchController.search returns empty json when query is invalid', async () => {
  const controller = new SearchController({
    searchService: {
      search: async () => {
        throw new Error('search should not be called');
      },
    },
  });
  const res = createResponse();

  await controller.search({ query: {} }, res, (error) => {
    throw error;
  });

  assert.deepEqual(res.state.json, {
    hits: [],
    found: 0,
    page: 1,
  });
});

test('SearchController.getPage forwards query and focus to page view', async () => {
  const controller = new SearchController({
    searchService: {
      getPageById: async (id) => ({ id, title: 'Detalhe' }),
    },
  });
  const res = createResponse();

  await controller.getPage({
    params: { id: '123' },
    query: { q: 'lei limpeza', focus: 'trecho relevante' },
  }, res, (error) => {
    throw error;
  });

  assert.equal(res.state.render.view, 'page');
  assert.equal(res.state.render.payload.query, 'lei limpeza');
  assert.equal(res.state.render.payload.focus, 'trecho relevante');
  assert.equal(res.state.render.payload.page.id, '123');
});

test('SearchController.summarizePage returns AI summary payload', async () => {
  const controller = new SearchController({
    searchService: {
      getPageById: async (id) => ({ id, title: 'Detalhe', markdownContent: 'Conteudo relevante' }),
    },
    aiSummaryService: {
      summarizeDocument: async (page, options) => ({
        provider: 'google',
        model: 'gemini-test',
        summary: `Resumo de ${page.id} para ${options.query} usando ${options.feature}`,
      }),
    },
  });
  const res = createResponse();

  await controller.summarizePage({
    params: { id: '123' },
    body: { query: 'lei limpeza' },
    query: {},
  }, res, (error) => {
    throw error;
  });

  assert.equal(res.state.json.provider, 'google');
  assert.equal(res.state.json.model, 'gemini-test');
  assert.match(res.state.json.summary, /lei limpeza/);
  assert.match(res.state.json.summary, /pageSummary/);
  assert.ok(res.state.json.generatedAt);
});
