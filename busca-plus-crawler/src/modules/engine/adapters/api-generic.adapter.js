const BaseAdapter = require('./base-adapter');

class ApiGenericAdapter extends BaseAdapter {
  constructor() {
    super('api.generic.v1');
  }

  canHandle(input) {
    if (input.classifiedAs === 'api.response') return 0.9;
    return 0;
  }

  async extract(input) {
    const { url, html: rawBody, source } = input;
    if (!rawBody) return [];

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return [];
    }

    const config = source?.config_json?.api || {};
    const itemsPath = config.items_path || 'results';
    const items = this._getPath(data, itemsPath);

    if (!Array.isArray(items) || !items.length) {
      return [{
        url,
        title: `Resposta API: ${new URL(url).hostname}`,
        textContent: JSON.stringify(data).substring(0, 5000),
        itemKind: 'other',
        metadata: { apiUrl: url },
        discoveredUrls: [],
      }];
    }

    return items.map((item) => this._mapItem(item, url, config));
  }

  _mapItem(item, sourceUrl, config) {
    return {
      url: this._getPath(item, config.url_field || 'url') || sourceUrl,
      title: String(this._getPath(item, config.title_field || 'title') || '').substring(0, 500),
      description: String(this._getPath(item, config.description_field || 'description') || '').substring(0, 1000),
      textContent: JSON.stringify(item).substring(0, 10000),
      itemKind: config.item_kind || 'other',
      documentType: String(this._getPath(item, config.document_type_field || '') || ''),
      documentNumber: String(this._getPath(item, config.document_number_field || '') || ''),
      publicationDate: String(this._getPath(item, config.date_field || '') || ''),
      fileUrl: String(this._getPath(item, config.file_url_field || '') || ''),
      metadata: item,
      discoveredUrls: [],
    };
  }

  _getPath(obj, path) {
    if (!path || !obj) return null;
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), obj);
  }
}

module.exports = new ApiGenericAdapter();
