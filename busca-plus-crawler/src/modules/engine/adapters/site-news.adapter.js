const cheerio = require('cheerio');
const BaseAdapter = require('./base-adapter');

class SiteNewsAdapter extends BaseAdapter {
  constructor() {
    super('site.news.v1');
  }

  canHandle(input) {
    if (input.classifiedAs !== 'html.detail' && input.classifiedAs !== 'html.page') return 0;

    const { html = '', url = '' } = input;

    // Indicadores fortes de noticia
    const hasNewsSchema = html.includes('"NewsArticle"') || html.includes('"Article"');
    const hasNewsUrl = /\/(noticia|noticias|news|post|artigo|materia|comunicado)\b/i.test(url);
    const hasDateInUrl = /\/\d{4}\/\d{2}\/\d{2}\//.test(url);
    const hasArticleTag = /<article\b/i.test(html);

    let score = 0;
    if (hasNewsSchema) score += 0.4;
    if (hasNewsUrl) score += 0.3;
    if (hasDateInUrl) score += 0.2;
    if (hasArticleTag) score += 0.1;

    return Math.min(score, 0.95);
  }

  async extract(input) {
    const { url, html } = input;
    if (!html) return [];

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, .menu, .sidebar').remove();

    const title = this._extractTitle($);
    const description = this._extractDescription($);
    const publicationDate = this._extractDate($, html);
    const textContent = this._extractArticleText($);
    const images = this._extractImages($, url);

    return [{
      url,
      canonicalUrl: $('link[rel="canonical"]').attr('href') || url,
      title,
      description,
      textContent,
      itemKind: 'news',
      publicationDate,
      metadata: {
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
        ogImage: $('meta[property="og:image"]').attr('content') || '',
        author: $('meta[name="author"]').attr('content') || $('[itemprop="author"]').text().trim() || '',
      },
      images,
      discoveredUrls: [],
    }];
  }

  _extractTitle($) {
    return (
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      $('title').text() ||
      ''
    ).trim().substring(0, 500);
  }

  _extractDescription($) {
    return (
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      ''
    ).trim().substring(0, 1000);
  }

  _extractDate($, html) {
    // Schema.org
    const schemaMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (schemaMatch) return schemaMatch[1];

    // Meta tags
    const metaCandidates = [
      $('meta[property="article:published_time"]').attr('content'),
      $('meta[name="date"]').attr('content'),
      $('[itemprop="datePublished"]').attr('content'),
      $('time[datetime]').first().attr('datetime'),
    ];
    return metaCandidates.find(Boolean) || '';
  }

  _extractArticleText($) {
    const selectors = ['article', '.post-content', '.entry-content', '.news-content', 'main'];
    for (const sel of selectors) {
      const el = $(sel);
      if (el.length) return el.text().replace(/\s+/g, ' ').trim().substring(0, 50000);
    }
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 50000);
  }

  _extractImages($, pageUrl) {
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      try {
        return [{ src: new URL(ogImage, pageUrl).href, alt: '' }];
      } catch { /* ignora */ }
    }
    return [];
  }
}

module.exports = new SiteNewsAdapter();
