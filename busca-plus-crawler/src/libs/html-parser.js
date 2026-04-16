const cheerio = require('cheerio');
const { generateSlug, extractDomain } = require('./url-utils');

/**
 * Parses HTML content and extracts metadata and content
 */
class HtmlParser {
  constructor(html, baseUrl) {
    this.$ = cheerio.load(html);
    this.baseUrl = baseUrl;
  }

  /**
   * Extracts the title of the page
   * @returns {string|null}
   */
  extractTitle() {
    // Try og:title first
    let title = this.$('meta[property="og:title"]').attr('content');
    if (title) return this.cleanText(title);

    // Try twitter:title
    title = this.$('meta[name="twitter:title"]').attr('content');
    if (title) return this.cleanText(title);

    // Try <title> tag
    title = this.$('title').first().text();
    if (title) return this.cleanText(title);

    return null;
  }

  /**
   * Extracts the description of the page
   * @returns {string|null}
   */
  extractDescription() {
    // Try meta description
    let description = this.$('meta[name="description"]').attr('content');
    if (description) return this.cleanText(description);

    // Try og:description
    description = this.$('meta[property="og:description"]').attr('content');
    if (description) return this.cleanText(description);

    // Try twitter:description
    description = this.$('meta[name="twitter:description"]').attr('content');
    if (description) return this.cleanText(description);

    return null;
  }

  /**
   * Extracts the canonical URL
   * @returns {string|null}
   */
  extractCanonicalUrl() {
    const canonical = this.$('link[rel="canonical"]').attr('href');
    if (canonical) {
      // Resolve relative URLs
      if (canonical.startsWith('/')) {
        return new URL(canonical, this.baseUrl).toString();
      }
      return canonical;
    }
    return null;
  }

  /**
   * Extracts the favicon URL
   * @returns {string|null}
   */
  extractFavicon() {
    // Try various favicon locations
    let favicon = this.$('link[rel="icon"]').attr('href');
    if (favicon) return this.resolveUrl(favicon);

    favicon = this.$('link[rel="shortcut icon"]').attr('href');
    if (favicon) return this.resolveUrl(favicon);

    favicon = this.$('link[rel="apple-touch-icon"]').attr('href');
    if (favicon) return this.resolveUrl(favicon);

    // Default favicon location
    const domain = extractDomain(this.baseUrl);
    if (domain) {
      return `https://${domain}/favicon.ico`;
    }

    return null;
  }

  /**
   * Extracts the language of the page
   * @returns {string|null}
   */
  extractLanguage() {
    // Try html lang attribute
    let lang = this.$('html').attr('lang');
    if (lang) return lang.substring(0, 10);

    // Try meta content-language
    lang = this.$('meta[http-equiv="content-language"]').attr('content');
    if (lang) return lang.substring(0, 10);

    return null;
  }

  /**
   * Extracts keywords from the page
   * @returns {string[]}
   */
  extractKeywords() {
    const keywordsMeta = this.$('meta[name="keywords"]').attr('content');
    if (keywordsMeta) {
      return keywordsMeta.split(',').map(k => k.trim()).filter(k => k);
    }
    return [];
  }

  /**
   * Extracts the author of the page
   * @returns {string|null}
   */
  extractAuthor() {
    // Try meta author
    let author = this.$('meta[name="author"]').attr('content');
    if (author) return this.cleanText(author);

    // Try schema.org author
    author = this.$('[itemprop="author"]').text();
    if (author) return this.cleanText(author);

    return null;
  }

  /**
   * Extracts published date
   * @returns {string|null}
   */
  extractPublishedDate() {
    // Try various date meta tags
    let date = this.$('meta[property="article:published_time"]').attr('content');
    if (date) return date;

    date = this.$('meta[name="date"]').attr('content');
    if (date) return date;

    date = this.$('time[datetime]').attr('datetime');
    if (date) return date;

    return null;
  }

  /**
   * Extracts Open Graph image
   * @returns {string|null}
   */
  extractImage() {
    let image = this.$('meta[property="og:image"]').attr('content');
    if (image) return this.resolveUrl(image);

    image = this.$('meta[name="twitter:image"]').attr('content');
    if (image) return this.resolveUrl(image);

    return null;
  }

  /**
   * Extracts the main content text from the page
   * @returns {string}
   */
  extractContentText() {
    // Remove unwanted elements
    const $ = this.$;
    
    // Remove script, style, nav, footer, header, aside, etc.
    $('script, style, nav, footer, header, aside, form, iframe, noscript').remove();
    
    // Remove hidden elements
    $('[style*="display: none"], [style*="display:none"], [hidden]').remove();
    
    // Try to find main content areas
    let content = '';
    
    // Try article tag
    if ($('article').length) {
      content = $('article').first().text();
    }
    
    // Try main tag
    if (!content && $('main').length) {
      content = $('main').first().text();
    }
    
    // Try role="main"
    if (!content && $('[role="main"]').length) {
      content = $('[role="main"]').first().text();
    }
    
    // Try id="content" or class="content"
    if (!content) {
      const contentEl = $('#content, .content, #main, .main').first();
      if (contentEl.length) {
        content = contentEl.text();
      }
    }
    
    // Fallback to body
    if (!content) {
      content = $('body').text();
    }
    
    return this.cleanText(content);
  }

  /**
   * Extracts all internal links from the page
   * @returns {string[]}
   */
  extractInternalLinks() {
    const links = new Set();
    const baseDomain = extractDomain(this.baseUrl);
    
    this.$('a[href]').each((_, el) => {
      const href = this.$(el).attr('href');
      if (!href) return;
      
      // Resolve relative URLs
      const fullUrl = this.resolveUrl(href);
      
      // Check if it's an internal link
      const linkDomain = extractDomain(fullUrl);
      if (linkDomain === baseDomain) {
        // Normalize and add
        const normalized = this.normalizeUrlForStorage(fullUrl);
        if (normalized && this.isValidCrawlUrl(normalized)) {
          links.add(normalized);
        }
      }
    });
    
    return Array.from(links);
  }

  /**
   * Counts words in text
   * @param {string} text - Text to count words in
   * @returns {number}
   */
  countWords(text) {
    if (!text) return 0;
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Generates a slug for the page
   * @param {string} title - Page title
   * @returns {string}
   */
  generatePageSlug(title) {
    return generateSlug(this.baseUrl, title);
  }

  /**
   * Extracts all images from the page with context
   * @returns {Object[]} Array of image objects
   */
  extractImages() {
    const images = [];
    const seen = new Set();
    const $ = this.$;
    
    this.$('img').each((_, el) => {
      const $el = $(el);
      let src = $el.attr('src');
      
      if (!src) return;
      
      // Resolve relative URLs
      src = this.resolveUrl(src);
      
      // Skip duplicates and data URIs
      if (seen.has(src) || src.startsWith('data:')) return;
      seen.add(src);
      
      // Get image attributes
      const alt = $el.attr('alt') || '';
      const title = $el.attr('title') || '';
      const width = parseInt($el.attr('width')) || 0;
      const height = parseInt($el.attr('height')) || 0;
      
      // Only include images with minimum size (skip tiny icons/spacers)
      if (width > 0 && height > 0 && (width < 50 || height < 50)) return;
      
      // Extract context: text from nearby elements
      let context = '';
      const parent = $el.parent();
      const grandparent = parent.parent();
      
      // Try to get caption or nearby text
      const nearbyText = [
        $el.closest('figure').find('figcaption').text(),
        $el.closest('picture').text(),
        parent.find('p, span, div').first().text(),
        grandparent.find('p, span').first().text(),
      ].filter(Boolean).join(' ');
      
      context = this.cleanText(nearbyText) || '';
      
      // Extract filename from URL
      const filename = src.split('/').pop().split('.')[0].replace(/[-_]/g, ' ');
      
      images.push({
        src,
        alt: this.cleanText(alt) || '',
        title: this.cleanText(title) || '',
        context: (context || '').substring(0, 200),
        filename: filename,
        width,
        height,
      });
    });
    
    // Also check for Open Graph images
    const ogImage = this.$('meta[property="og:image"]').attr('content');
    if (ogImage && !seen.has(ogImage)) {
      const ogTitle = this.$('meta[property="og:title"]').attr('content') || this.extractTitle() || '';
      images.unshift({
        src: this.resolveUrl(ogImage),
        alt: ogTitle,
        title: '',
        context: ogTitle,
        filename: '',
        width: 0,
        height: 0,
        isOg: true,
      });
    }
    
    // Limit to 20 images per page
    return images.slice(0, 20);
  }

  /**
   * Extracts all metadata as an object
   * @returns {Object}
   */
  extractAll() {
    const title = this.extractTitle();
    const description = this.extractDescription();
    const contentText = this.extractContentText();
    
    return {
      title,
      description,
      canonicalUrl: this.extractCanonicalUrl(),
      favicon: this.extractFavicon(),
      language: this.extractLanguage(),
      contentText,
      contentHtml: this.extractContentHtml(),
      wordCount: this.countWords(contentText),
      slug: this.generatePageSlug(title),
      metadata: {
        keywords: this.extractKeywords(),
        author: this.extractAuthor(),
        publishedDate: this.extractPublishedDate(),
        image: this.extractImage(),
      },
      internalLinks: this.extractInternalLinks(),
      images: this.extractImages(),
    };
  }

  // Helper methods

  cleanText(text) {
    if (!text) return '';
    const result = text
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    return result || '';
  }

  resolveUrl(url) {
    if (!url) return null;
    try {
      return new URL(url, this.baseUrl).toString();
    } catch {
      return url;
    }
  }

  normalizeUrlForStorage(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return null;
    }
  }

  isValidCrawlUrl(url) {
    if (!url) return false;
    const invalidExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.exe', '.dmg', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.mp3', '.mp4', '.avi', '.mov'];
    const lowerUrl = url.toLowerCase();
    return !invalidExtensions.some(ext => lowerUrl.endsWith(ext));
  }

  extractContentHtml() {
    const $ = this.$;
    
    // Remove unwanted elements
    $('script, style, nav, footer, header, aside, form, iframe, noscript').remove();
    $('[style*="display: none"], [style*="display:none"], [hidden]').remove();
    
    // Try to find main content
    if ($('article').length) {
      return $('article').first().html();
    }
    
    if ($('main').length) {
      return $('main').first().html();
    }
    
    const contentEl = $('#content, .content, #main, .main').first();
    if (contentEl.length) {
      return contentEl.html();
    }
    
    return $('body').html();
  }
}

module.exports = HtmlParser;