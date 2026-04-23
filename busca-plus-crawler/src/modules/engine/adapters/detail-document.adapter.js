const cheerio = require('cheerio');
const BaseAdapter = require('./base-adapter');

const DOCUMENT_PATTERNS = [
  { regex: /lei\s+(?:municipal|estadual|federal)?\s*n[°º.\s]*[\d.]+/i, type: 'Lei' },
  { regex: /decreto\s*(?:municipal|estadual|federal)?\s*n[°º.\s]*[\d.]+/i, type: 'Decreto' },
  { regex: /portaria\s*n[°º.\s]*[\d.]+/i, type: 'Portaria' },
  { regex: /resolucao\s*n[°º.\s]*[\d.]+/i, type: 'Resolução' },
  { regex: /instrucao\s+normativa\s*n[°º.\s]*[\d.]+/i, type: 'Instrução Normativa' },
  { regex: /edital\s*n[°º.\s]*[\d.]+/i, type: 'Edital' },
  { regex: /contrato\s*n[°º.\s]*[\d.]+/i, type: 'Contrato' },
  { regex: /ata\s*n[°º.\s]*[\d.]+/i, type: 'Ata' },
];

class DetailDocumentAdapter extends BaseAdapter {
  constructor() {
    super('detail.document.v1');
  }

  canHandle(input) {
    if (input.classifiedAs === 'html.protocol') return 0.95;
    if (input.classifiedAs === 'html.detail') {
      const { html = '' } = input;
      const detected = this._detectDocumentPattern(html.substring(0, 8000));
      return detected ? 0.85 : 0.3;
    }
    return 0;
  }

  async extract(input) {
    const { url, html } = input;
    if (!html) return [];

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, .menu').remove();

    const bodyText = $('body').text();
    const { documentType, documentNumber } = this._detectDocumentPattern(bodyText) || {};

    const title = this._buildTitle($, documentType, documentNumber);
    const description = this._extractDescription($);
    const publicationDate = this._extractDate($, bodyText);
    const department = this._extractDepartment($, bodyText);
    const textContent = this._extractMainContent($);
    const fileUrl = this._findFileLink($, url);
    const fileExtension = fileUrl ? fileUrl.match(/\.(pdf|docx?|xlsx?)$/i)?.[1]?.toUpperCase() : '';

    return [{
      url,
      canonicalUrl: $('link[rel="canonical"]').attr('href') || url,
      title,
      description,
      textContent,
      itemKind: 'official_document',
      documentType: documentType || '',
      documentNumber: documentNumber || '',
      publicationDate,
      department,
      fileUrl,
      fileExtension,
      metadata: {
        rawDocument: bodyText.substring(0, 2000),
      },
      discoveredUrls: fileUrl ? [fileUrl] : [],
    }];
  }

  _detectDocumentPattern(text) {
    for (const { regex, type } of DOCUMENT_PATTERNS) {
      const match = text.match(regex);
      if (match) {
        const numMatch = match[0].match(/[\d.\/]+/);
        return {
          documentType: type,
          documentNumber: numMatch ? numMatch[0].replace(/\.$/, '') : '',
        };
      }
    }
    return null;
  }

  _buildTitle($, documentType, documentNumber) {
    if (documentType && documentNumber) {
      return `${documentType} nº ${documentNumber}`.trim();
    }
    return (
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      $('title').text() ||
      ''
    ).trim().substring(0, 500);
  }

  _extractDescription($) {
    const ementa = $('[class*="ementa"], [id*="ementa"]').first().text().trim();
    if (ementa) return ementa.substring(0, 1000);
    return (
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
    ).trim().substring(0, 1000);
  }

  _extractDate($, text) {
    // Data em metatags
    const metaDate =
      $('meta[name="date"]').attr('content') ||
      $('time[datetime]').first().attr('datetime');
    if (metaDate) return metaDate;

    // Data no texto
    const dateMatch = text.match(/\b(\d{2}[\/.-]\d{2}[\/.-]\d{4}|\d{4}-\d{2}-\d{2})\b/);
    return dateMatch ? dateMatch[1] : '';
  }

  _extractDepartment($, text) {
    const candidates = [
      $('[class*="orgao"], [class*="secretaria"], [class*="departamento"]').first().text().trim(),
    ];
    const deptMatch = text.match(/(?:secretaria|departamento|diretoria|orgao)\s+(?:municipal|estadual|de\s+)?(?:[\w\s]{3,50})/i);
    if (deptMatch) candidates.push(deptMatch[0].trim());
    return candidates.find((c) => c.length > 3) || '';
  }

  _extractMainContent($) {
    const selectors = ['[class*="conteudo"], [class*="content"], article, main, .documento'];
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length) return el.text().replace(/\s+/g, ' ').trim().substring(0, 50000);
    }
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 50000);
  }

  _findFileLink($, pageUrl) {
    let fileUrl = null;
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href');
      if (href && /\.(pdf|docx?|xlsx?)$/i.test(href)) {
        try {
          fileUrl = new URL(href, pageUrl).href;
          return false; // break
        } catch { /* ignora */ }
      }
    });
    return fileUrl;
  }
}

module.exports = new DetailDocumentAdapter();
