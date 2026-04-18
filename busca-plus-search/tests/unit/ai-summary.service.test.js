const test = require('node:test');
const assert = require('node:assert/strict');

const AiSummaryService = require('../../src/modules/ai/ai-summary.service');

test('AiSummaryService summarizes with Google configuration', async () => {
  const calls = [];
  const service = new AiSummaryService({
    axiosInstance: {
      post: async (url, body, options) => {
        calls.push({ url, body, options });
        return {
          data: {
            candidates: [
              {
                content: {
                  parts: [{ text: '- Resumo objetivo\n- Segundo ponto' }],
                },
              },
            ],
          },
        };
      },
    },
    aiConfig: {
      enabled: true,
      provider: 'google',
      summaryMaxCharacters: 12000,
      features: {
        pageSummary: true,
        searchReport: true,
      },
      google: {
        enabled: true,
        apiKey: 'test-key',
        model: 'gemini-test',
        apiUrl: 'https://example.com/models',
      },
      ollama: {
        enabled: false,
      },
    },
  });

  const result = await service.summarizeDocument({
    title: 'Lei Municipal',
    markdownContent: 'Conteudo do documento',
    sourceName: 'Portal',
    url: 'https://example.com/doc',
  }, { query: 'lei limpeza', feature: 'pageSummary' });

  assert.equal(result.provider, 'google');
  assert.equal(result.model, 'gemini-test');
  assert.match(result.summary, /Resumo objetivo/);
  assert.equal(calls[0].url, 'https://example.com/models/gemini-test:generateContent');
  assert.equal(calls[0].options.params.key, 'test-key');
});

test('AiSummaryService summarizes with Ollama configuration', async () => {
  const service = new AiSummaryService({
    axiosInstance: {
      post: async () => ({
        data: {
          response: 'Resumo via Ollama',
        },
      }),
    },
    aiConfig: {
      enabled: true,
      provider: 'ollama',
      summaryMaxCharacters: 12000,
      features: {
        pageSummary: true,
        searchReport: true,
      },
      google: {
        enabled: false,
      },
      ollama: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434',
        model: 'llama3.1',
      },
    },
  });

  const result = await service.summarizeDocument({
    title: 'Documento',
    markdownContent: 'Conteudo',
  }, { feature: 'pageSummary' });

  assert.equal(result.provider, 'ollama');
  assert.equal(result.model, 'llama3.1');
  assert.equal(result.summary, 'Resumo via Ollama');
});
