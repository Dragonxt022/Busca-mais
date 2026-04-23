const path = require('path');

const PDF_EXTENSIONS = new Set(['.pdf']);
const OFFICE_EXTENSIONS = new Set(['.docx', '.doc', '.xlsx', '.xls', '.odt', '.ods']);
const FILE_EXTENSIONS = new Set([...PDF_EXTENSIONS, ...OFFICE_EXTENSIONS, '.zip', '.csv', '.txt']);

// Padroes de listagem: apenas quando a categoria é o segmento FINAL da URL
// ou quando há paginação explícita. Evita falso positivo em /leis/lei-123.
const LISTING_URL_PATTERNS = [
  /\/(list|listagem|publicacoes|documentos|leis|decretos|portarias|atos|noticias|news|posts|artigos|comunicados|editais|contratos|licitacoes)\/?$/i,
  /[?&](page|pagina|p)=\d+/i,
  /\/(categoria|category|tag|arquivo|archive)\//i,
];

const NEWS_URL_PATTERNS = [
  /\/(noticia|noticias|news|post|artigo|materia|comunicado|releases?)\b/i,
  /\/\d{4}\/\d{2}\/\d{2}\//,
];

const PROTOCOL_HTML_PATTERNS = [
  /protocolo|processo\s+n[°º]/i,
  /lei\s+n[°º]\s*[\d.]+/i,
  /decreto\s+n[°º]\s*[\d.]+/i,
  /portaria\s+n[°º]\s*[\d.]+/i,
];

/**
 * Classifica uma entrada com base na URL, MIME type e conteudo HTML.
 * Retorna um dos tipos definidos no PRD.
 *
 * Tipos possiveis:
 *   file.pdf | file.office | html.listing | html.detail | html.protocol | html.page | api.response | unknown
 */
class Classifier {
  classify(input) {
    const { url = '', html = '' } = input;
    const contentType = String(input.contentType || '');

    // Arquivos binarios por MIME
    if (contentType.includes('application/pdf') || this._hasPdfExtension(url)) {
      return 'file.pdf';
    }
    if (
      contentType.includes('application/vnd.openxmlformats') ||
      contentType.includes('application/vnd.ms-') ||
      contentType.includes('application/msword') ||
      this._hasOfficeExtension(url)
    ) {
      return 'file.office';
    }

    // Resposta de API
    if (
      contentType.includes('application/json') ||
      contentType.includes('application/xml') ||
      contentType.includes('text/xml')
    ) {
      return 'api.response';
    }

    // A partir daqui, assume HTML
    if (!contentType.includes('text/html') && contentType && !contentType.includes('text/')) {
      return 'unknown';
    }

    // Listagem por URL
    if (LISTING_URL_PATTERNS.some((p) => p.test(url))) {
      return 'html.listing';
    }

    // Noticia/post por URL
    if (NEWS_URL_PATTERNS.some((p) => p.test(url))) {
      return 'html.detail';
    }

    // Protocolo/documento oficial por conteudo HTML
    if (html && PROTOCOL_HTML_PATTERNS.some((p) => p.test(html.substring(0, 5000)))) {
      return 'html.protocol';
    }

    // Pagina generica
    return 'html.page';
  }

  _hasPdfExtension(url) {
    try {
      const parsed = new URL(url);
      return PDF_EXTENSIONS.has(path.extname(parsed.pathname).toLowerCase());
    } catch {
      return url.toLowerCase().endsWith('.pdf');
    }
  }

  _hasOfficeExtension(url) {
    try {
      const parsed = new URL(url);
      return OFFICE_EXTENSIONS.has(path.extname(parsed.pathname).toLowerCase());
    } catch {
      return false;
    }
  }

  isFileType(classified) {
    return classified.startsWith('file.');
  }

  isHtmlType(classified) {
    return classified.startsWith('html.');
  }
}

module.exports = new Classifier();
