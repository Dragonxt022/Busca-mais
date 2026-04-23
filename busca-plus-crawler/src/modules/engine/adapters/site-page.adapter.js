const cheerio = require('cheerio');
const BaseAdapter = require('./base-adapter');
const { extractDomain, normalizeUrl, isSameDomain } = require('../../../libs/url-utils');

class SitePageAdapter extends BaseAdapter {
  constructor() {
    super('site.page.v1');
  }

  canHandle(input) {
    if (input.classifiedAs === 'html.page') return 0.8;
    if (input.classifiedAs === 'html.detail') return 0.5;
    if (input.classifiedAs === 'html.listing') return 0.3;
    return 0;
  }

  async extract(input) {
    const { url, html, source } = input;
    if (!html) return [];

    const $ = cheerio.load(html);

    // Remove elementos nao-conteudo
    $('script, style, nav, footer, header, aside, .menu, .sidebar, .ads, .cookie, iframe').remove();

    const title = this._extractTitle($);
    const description = this._extractDescription($);
    const textContent = this._extractText($);
    const images = this._extractImages($, url);
    const discoveredUrls = this._extractLinks($, url, source);

    return [{
      url,
      canonicalUrl: this._extractCanonical($, url),
      title,
      description,
      textContent,
      itemKind: 'page',
      metadata: {
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
        ogImage: $('meta[property="og:image"]').attr('content') || '',
        language: $('html').attr('lang') || '',
      },
      images,
      discoveredUrls,
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

  _extractCanonical($, fallback) {
    return $('link[rel="canonical"]').attr('href') || fallback;
  }

  _extractText($) {
    const mainSelectors = ['main', 'article', '[role="main"]', '#content', '.content', '.post-content', 'body'];
    for (const sel of mainSelectors) {
      const el = $(sel);
      if (el.length) {
        return el.text().replace(/\s+/g, ' ').trim().substring(0, 50000);
      }
    }
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 50000);
  }

  _extractImages($, pageUrl) {
    const images = [];
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src');
      const alt = $(el).attr('alt') || '';
      if (!src || src.startsWith('data:')) return;
      try {
        const absoluteUrl = new URL(src, pageUrl).href;
        images.push({ src: absoluteUrl, alt });
      } catch {
        // ignora URLs invalidas
      }
    });
    return images.slice(0, 5);
  }

  _extractLinks($, pageUrl, source) {
    const links = [];
    const domain = extractDomain(pageUrl);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      try {
        const absolute = new URL(href, pageUrl).href;
        if (isSameDomain(absolute, pageUrl)) {
          links.push(normalizeUrl(absolute));
        }
      } catch {
        // ignora
      }
    });

    const maxLinks = source?.config_json?.max_links_per_page || 100;
    return [...new Set(links)].slice(0, maxLinks);
  }
}

module.exports = new SitePageAdapter();
