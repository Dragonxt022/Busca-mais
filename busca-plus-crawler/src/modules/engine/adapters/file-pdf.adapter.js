const BaseAdapter = require('./base-adapter');
const { logger } = require('../../../libs/logger');

class FilePdfAdapter extends BaseAdapter {
  constructor() {
    super('file.pdf.v1');
  }

  canHandle(input) {
    if (input.classifiedAs === 'file.pdf') return 1.0;
    return 0;
  }

  async extract(input) {
    const { url, buffer, source } = input;
    if (!buffer) return [];

    let textContent = '';
    let markdownContent = '';

    try {
      // Usa o servico de extracao de conteudo existente se disponivel
      const contentService = this._getContentService();
      if (contentService) {
        const result = await contentService.extractFromBuffer(buffer, 'pdf', url);
        textContent = result.text || '';
        markdownContent = result.markdown || '';
      }
    } catch (err) {
      logger.warn(`FilePdfAdapter: falha ao extrair texto de ${url}: ${err.message}`);
    }

    const filename = url.split('/').pop().split('?')[0] || 'documento.pdf';
    const title = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim();

    return [{
      url,
      canonicalUrl: url,
      title: title.substring(0, 500),
      description: textContent.substring(0, 300),
      textContent: textContent.substring(0, 50000),
      markdownContent,
      itemKind: 'pdf',
      fileUrl: url,
      fileExtension: 'PDF',
      metadata: {
        filename,
        sourceId: source?.id,
        extractedPages: this._countPages(textContent),
      },
      discoveredUrls: [],
    }];
  }

  _getContentService() {
    try {
      return require('../../transparency/services/catalog-document-content.service');
    } catch {
      return null;
    }
  }

  _countPages(text) {
    const matches = text.match(/\f/g);
    return matches ? matches.length + 1 : null;
  }
}

module.exports = new FilePdfAdapter();
