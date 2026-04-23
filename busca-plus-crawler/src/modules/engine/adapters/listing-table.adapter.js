const cheerio = require('cheerio');
const BaseAdapter = require('./base-adapter');

const DOCUMENT_TYPE_MAP = {
  lei: 'Lei',
  decreto: 'Decreto',
  portaria: 'Portaria',
  resolucao: 'Resolução',
  instrucao: 'Instrução Normativa',
  edital: 'Edital',
  contrato: 'Contrato',
  convenio: 'Convênio',
  ata: 'Ata',
};

class ListingTableAdapter extends BaseAdapter {
  constructor() {
    super('listing.table.v1');
  }

  canHandle(input) {
    if (input.classifiedAs !== 'html.listing') return 0;

    const { html = '' } = input;
    const hasTable = /<table\b/i.test(html);
    const hasRows = (html.match(/<tr\b/gi) || []).length > 3;

    if (hasTable && hasRows) return 0.9;
    if (hasTable) return 0.6;
    return 0.3;
  }

  async extract(input) {
    const { url, html, source } = input;
    if (!html) return [];

    const $ = cheerio.load(html);
    const items = [];
    const discoveredUrls = [];

    $('table').each((tableIdx, table) => {
      const headers = this._extractHeaders($, table);
      if (!headers.length) return;

      $('tbody tr, tr', table).each((rowIdx, row) => {
        const cells = $('td', row);
        if (!cells.length) return;

        const rowData = {};
        cells.each((i, cell) => {
          const header = headers[i] || `col_${i}`;
          rowData[header] = $(cell).text().trim();
        });

        // Descobre links na linha
        const rowLinks = [];
        $('a[href]', row).each((_, a) => {
          const href = $(a).attr('href');
          if (href) {
            try {
              const absolute = new URL(href, url).href;
              rowLinks.push(absolute);
              discoveredUrls.push(absolute);
            } catch { /* ignora */ }
          }
        });

        const { documentType, documentNumber } = this._inferDocumentMeta(rowData);
        const title = this._buildTitle(rowData, documentType, documentNumber);

        if (!title) return;

        items.push({
          url: rowLinks[0] || url,
          canonicalUrl: rowLinks[0] || url,
          title,
          description: rowData.descricao || rowData.ementa || rowData.assunto || '',
          itemKind: 'listing_item',
          documentType,
          documentNumber,
          publicationDate: rowData.data || rowData.data_publicacao || rowData.publicacao || '',
          department: rowData.orgao || rowData.secretaria || rowData.departamento || '',
          fileUrl: rowLinks.find((l) => /\.(pdf|docx?|xlsx?)$/i.test(l)) || '',
          fileExtension: this._detectExtension(rowLinks),
          metadata: { tableIndex: tableIdx, rowData, sourceUrl: url },
          discoveredUrls: rowLinks,
        });
      });
    });

    // Se nao encontrou tabelas, tenta lista de links
    if (!items.length) {
      return this._extractFromLinkList($, url, source);
    }

    return items;
  }

  _extractHeaders($, table) {
    const headers = [];
    $('thead th, tr:first-child th', table).each((_, th) => {
      headers.push($(th).text().trim().toLowerCase().replace(/\s+/g, '_'));
    });
    return headers;
  }

  _inferDocumentMeta(rowData) {
    const values = Object.values(rowData).join(' ').toLowerCase();
    let documentType = '';
    let documentNumber = '';

    for (const [key, label] of Object.entries(DOCUMENT_TYPE_MAP)) {
      if (values.includes(key)) {
        documentType = label;
        break;
      }
    }

    const numMatch = values.match(/n[°º.\s]*(\d[\d./]+)/i);
    if (numMatch) documentNumber = numMatch[1];

    return { documentType, documentNumber };
  }

  _buildTitle(rowData, documentType, documentNumber) {
    if (documentType && documentNumber) {
      return `${documentType} nº ${documentNumber}`.trim();
    }
    return (
      rowData.titulo ||
      rowData.nome ||
      rowData.descricao ||
      rowData.assunto ||
      Object.values(rowData)[0] ||
      ''
    ).substring(0, 500);
  }

  _detectExtension(links) {
    for (const link of links) {
      const match = link.match(/\.(pdf|docx?|xlsx?|csv|txt)$/i);
      if (match) return match[1].toUpperCase();
    }
    return '';
  }

  _extractFromLinkList($, url) {
    const items = [];
    $('ul li a, ol li a, .list-item a').each((_, a) => {
      const href = $(a).attr('href');
      const text = $(a).text().trim();
      if (!href || !text || text.length < 5) return;
      try {
        const absolute = new URL(href, url).href;
        items.push({
          url: absolute,
          canonicalUrl: absolute,
          title: text.substring(0, 500),
          itemKind: 'listing_item',
          metadata: { sourceUrl: url },
          discoveredUrls: [absolute],
        });
      } catch { /* ignora */ }
    });
    return items;
  }
}

module.exports = new ListingTableAdapter();
