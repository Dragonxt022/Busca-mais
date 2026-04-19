const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPageViewModel } = require('../../src/modules/search');

test('buildPageViewModel strips duplicate leading heading for catalog documents', () => {
  const viewModel = buildPageViewModel({
    page: {
      id: 'catalog-1',
      title: 'Decretos-Lei 2216/2026',
      recordType: 'catalog_document',
      markdownContent: [
        '# Decretos-Lei 2216/2026',
        '',
        'DECRETO Nº 2216, DE 16 DE ABRIL DE 2026 - LEI N. 1701',
        '',
        'Artigo 1.o - Fica aberto no orcamento vigente.',
      ].join('\n'),
    },
  });

  assert.doesNotMatch(viewModel.formattedContentHtml, /<h2>Decretos-Lei 2216\/2026<\/h2>/);
  assert.match(viewModel.formattedContentHtml, /DECRETO Nº 2216/);
  assert.match(viewModel.formattedContentHtml, /Artigo 1\.o/);
});
