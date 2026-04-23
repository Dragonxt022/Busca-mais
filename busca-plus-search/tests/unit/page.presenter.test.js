const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPageViewModel, formatContentHtml } = require('../../src/modules/search');

test('buildPageViewModel maps page data into a render-friendly payload', () => {
  const viewModel = buildPageViewModel({
    page: {
      id: 'doc-1',
      title: 'Edital de licitacao',
      recordType: 'catalog_document',
      summary: 'Resumo curto',
      sourceName: 'Portal Transparencia',
      sourceUrl: 'https://fonte.example.com',
      url: 'https://doc.example.com',
      downloadUrl: 'https://doc.example.com/arquivo.pdf',
      documentType: 'Edital',
      documentNumber: '12/2026',
      documentDate: '2026-04-10',
      publicationDate: '2026-04-11',
      markdownContent: 'CAPITULO I\nDescricao da secao',
      coverImage: '/img/capa-original.jpg',
      coverThumbnail: '/img/capa-thumb.jpg',
      crawledAt: '2026-04-17T10:00:00.000Z',
    },
    query: 'licitacao',
    focus: 'Descricao da secao',
    aiFeatures: {
      enabled: true,
      features: { pageSummary: true },
    },
  });

  assert.equal(viewModel.query, 'licitacao');
  assert.equal(viewModel.focus, 'Descricao da secao');
  assert.equal(viewModel.safeTitle, 'Edital de licitacao');
  assert.equal(viewModel.isCatalogDocument, true);
  assert.equal(viewModel.openUrl, 'https://doc.example.com/arquivo.pdf');
  assert.equal(viewModel.sourceHref, 'https://fonte.example.com');
  assert.equal(viewModel.featuredImage, '/img/capa-original.jpg');
  assert.equal(viewModel.aiPageEnabled, false);
  assert.match(viewModel.contentPreviewHtml, /Descricao da secao/);
  assert.equal(viewModel.originalLabel, 'Ver documento original');
  assert.equal(viewModel.documentMetaItems.length, 5);
  assert.equal(viewModel.readingPreviewMaxHeight, 800);
  assert.match(viewModel.formattedContentHtml, /document-section-title/);
  assert.match(viewModel.formattedContentHtml, /Descricao da secao/);
});

test('buildPageViewModel falls back to thumbnail only when original image is missing', () => {
  const viewModel = buildPageViewModel({
    page: {
      id: 'doc-1',
      title: 'Noticia',
      coverThumbnail: '/img/capa-thumb.jpg',
      markdownContent: 'Conteudo',
    },
  });

  assert.equal(viewModel.featuredImage, '/img/capa-thumb.jpg');
});

test('buildPageViewModel disables AI action when feature flag is off', () => {
  const viewModel = buildPageViewModel({
    page: { id: 'doc-1' },
    aiFeatures: {
      enabled: false,
      features: { pageSummary: false },
    },
  });

  assert.equal(viewModel.aiPageEnabled, false);
  assert.equal(viewModel.safeTitle, 'Detalhes do documento');
});

test('formatContentHtml escapes content and renders structural blocks', () => {
  const html = formatContentHtml([
    'Campo: Valor',
    'Outro: Item',
    '',
    '- Primeiro item',
    '- Segundo item',
    '',
    'Coluna A | Coluna B',
    'A1 | B1',
    '',
    '> Citacao',
    '',
    '<script>alert(1)</script>',
  ].join('\n'));

  assert.match(html, /<dl class="document-fields">/);
  assert.match(html, /<ul><li>Primeiro item<\/li><li>Segundo item<\/li><\/ul>/);
  assert.match(html, /<table class="document-table">/);
  assert.match(html, /<blockquote>Citacao<\/blockquote>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
