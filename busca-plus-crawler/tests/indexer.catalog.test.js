const test = require('node:test');
const assert = require('node:assert/strict');

const indexer = require('../src/libs/indexer');

test('buildCatalogDocument prefers extracted text as body and preserves extracted markdown heading', () => {
  const payload = indexer.buildCatalogDocument({
    id: 55,
    tipo: 'Decretos-Lei',
    numero_ano: '2216/2026',
    descricao: 'Detalhar Decretos-Lei 2216/2026',
    ementa: 'Abre no orcamento vigente credito adicional especial',
    data_documento: '16/04/2026',
    data_publicacao: '16/04/2026',
    download_url: 'https://example.com/decreto.pdf',
    extension: 'PDF',
    metadata_json: {
      extracted_text: [
        'DECRETO Nº 2216, DE 16 DE ABRIL DE 2026 - LEI N. 1701',
        '',
        'Artigo 1.o- Fica aberto no orcamento vigente, um credito adicional',
        'R$1.900,00 distribuidos as seguintes dotacoes',
      ].join('\n'),
      extracted_markdown: [
        '# Documento',
        '',
        'DECRETO Nº 2216, DE 16 DE ABRIL DE 2026 - LEI N. 1701',
        '',
        'Artigo 1.o- Fica aberto no orcamento vigente.',
      ].join('\n'),
    },
    source: {
      name: 'transparencia-cujubim',
      source_url: 'https://transparencia.cujubim.ro.gov.br',
      state: 'RO',
      city: 'Cujubim',
    },
  });

  assert.equal(payload.title, 'Decretos-Lei 2216/2026');
  assert.match(payload.content, /DECRETO Nº 2216/);
  assert.match(payload.content, /R\$1\.900,00/);
  assert.doesNotMatch(payload.content, /Detalhar Decretos-Lei/);
  assert.match(payload.markdown_content, /^# Decretos-Lei 2216\/2026/m);
});
