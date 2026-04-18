const test = require('node:test');
const assert = require('node:assert/strict');

const catalogDocumentContentService = require('../src/modules/transparency/services/catalog-document-content.service');

test('extractDoc falls back to plain text when .doc payload is not a valid Word binary', async () => {
  const buffer = Buffer.from('LEI MUNICIPAL 123\nTexto simples do documento para indexacao.', 'utf8');

  const result = await catalogDocumentContentService.extractDoc(buffer);

  assert.equal(result.type, 'doc');
  assert.match(result.text, /LEI MUNICIPAL 123/);
  assert.equal(result.info.fallback, 'text-decoder');
});

test('extractDoc uses LibreOffice fallback when antiword rejects a valid-looking .doc', async () => {
  const originalIsOleCompoundDocument = catalogDocumentContentService.isOleCompoundDocument;
  const originalExtractDocViaLibreOffice = catalogDocumentContentService.extractDocViaLibreOffice;
  const originalExecFileAsync = catalogDocumentContentService.execFileAsync;

  catalogDocumentContentService.isOleCompoundDocument = () => true;
  catalogDocumentContentService.extractDocViaLibreOffice = async () => ({
    info: { fallback: 'soffice' },
    markdown: '# Documento\n\nConteudo convertido',
    numpages: 0,
    numrender: 0,
    text: 'Conteudo convertido',
    textLength: 19,
    type: 'doc',
  });

  const buffer = Buffer.concat([
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]),
    Buffer.from('conteudo-binario-simulado', 'utf8'),
  ]);

  const antiwordError = new Error('Command failed: antiword file.doc');
  antiwordError.stderr = 'file.doc is not a Word Document.';

  catalogDocumentContentService.execFileAsync = async () => {
    throw antiwordError;
  };

  try {
    const result = await catalogDocumentContentService.extractDoc(buffer);
    assert.equal(result.info.fallback, 'soffice');
    assert.equal(result.text, 'Conteudo convertido');
  } finally {
    catalogDocumentContentService.isOleCompoundDocument = originalIsOleCompoundDocument;
    catalogDocumentContentService.extractDocViaLibreOffice = originalExtractDocViaLibreOffice;
    catalogDocumentContentService.execFileAsync = originalExecFileAsync;
  }
});
