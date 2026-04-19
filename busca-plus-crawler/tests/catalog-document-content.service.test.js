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

test('looksLikeGarbage returns true for empty or short text', () => {
  assert.equal(catalogDocumentContentService.looksLikeGarbage(''), true);
  assert.equal(catalogDocumentContentService.looksLikeGarbage('abc'), true);
  assert.equal(catalogDocumentContentService.looksLikeGarbage(null), true);
});

test('looksLikeGarbage returns true when text has mostly non-latin symbols', () => {
  const garbage = '\uFFFD\u2022\u25CF\u00B7'.repeat(20);
  assert.equal(catalogDocumentContentService.looksLikeGarbage(garbage), true);
});

test('looksLikeGarbage returns false for valid Portuguese text', () => {
  const text = 'LEI MUNICIPAL No 1234 de 2026. Art. 1o - Fica autorizada a abertura de credito adicional.';
  assert.equal(catalogDocumentContentService.looksLikeGarbage(text), false);
});

test('extractPdf falls back to OCR when pdf-parse returns empty text', async () => {
  const original = catalogDocumentContentService.extractPdfViaOcr;
  catalogDocumentContentService.extractPdfViaOcr = async () => ({
    info: { ocr: true },
    blocks: ['Conteudo via OCR'],
    hasContent: true,
    markdown: '# Documento\n\nConteudo via OCR',
    numpages: 1,
    numrender: 1,
    text: 'Conteudo via OCR',
    textLength: 16,
    type: 'pdf',
  });

  const originalPdfParse = catalogDocumentContentService.__pdfParse;

  try {
    const minimalPdf = Buffer.from('%PDF-1.4\n%%EOF\n');
    const result = await catalogDocumentContentService.extractPdf(minimalPdf);
    assert.equal(result.info.ocr, true);
    assert.equal(result.text, 'Conteudo via OCR');
  } finally {
    catalogDocumentContentService.extractPdfViaOcr = original;
    if (originalPdfParse) catalogDocumentContentService.__pdfParse = originalPdfParse;
  }
});

test('normalizeText preserves important numeric lines and paragraph breaks', () => {
  const normalized = catalogDocumentContentService.normalizeText([
    '2216/2026',
    '',
    'R$1.900,00 distribuidos as seguintes dotacoes',
    '',
    'Artigo 3o.- Este decreto entra em vigor na data de sua publicacao.',
  ].join('\n'));

  assert.match(normalized, /2216\/2026/);
  assert.match(normalized, /R\$1\.900,00/);
  assert.match(normalized, /Artigo 3o/);
});
