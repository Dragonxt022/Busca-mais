const cheerio = require('cheerio');
const { generateSlug, extractDomain } = require('./url-utils');

/**
 * Parses HTML content and extracts metadata and content
 */
class HtmlParser {
  constructor(html, baseUrl, options = {}) {
    this.$ = cheerio.load(html);
    this.baseUrl = baseUrl;
    this.primaryContentCache = null;
    this.options = {
      contentSelector: String(options.contentSelector || '').trim() || null,
      excludeSelectors: Array.isArray(options.excludeSelectors)
        ? options.excludeSelectors.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
    };
  }

  normalizeComparisonText(text) {
    return this.cleanText(text)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  getUrlSlugText() {
    try {
      const parsed = new URL(this.baseUrl);
      const lastSegment = decodeURIComponent(
        parsed.pathname.split('/').filter(Boolean).pop() || ''
      );

      return this.normalizeComparisonText(
        lastSegment
          .replace(/\.[a-z0-9]+$/i, '')
          .replace(/[-_]+/g, ' ')
      );
    } catch {
      return '';
    }
  }

  getMetaTitle() {
    const $ = this.$;

    const candidates = [
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="twitter:title"]').attr('content'),
      $('title').first().text(),
    ];

    return candidates.map((value) => this.cleanText(value)).find(Boolean) || '';
  }

  stringsAreRelated(left, right) {
    const normalizedLeft = this.normalizeComparisonText(left);
    const normalizedRight = this.normalizeComparisonText(right);

    if (!normalizedLeft || !normalizedRight) {
      return false;
    }

    if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
      return true;
    }

    const leftTokens = normalizedLeft.split(/\s+/).filter((token) => token.length >= 4);
    const rightTokens = new Set(normalizedRight.split(/\s+/).filter((token) => token.length >= 4));
    const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;

    return overlap >= Math.max(2, Math.floor(Math.min(leftTokens.length, rightTokens.size) / 2));
  }

  getRootText($root) {
    if (!$root || !$root.length) {
      return '';
    }

    return this.cleanText($root.text());
  }

  getRootTitle($root) {
    if (!$root || !$root.length) {
      return '';
    }

    const title = $root.find('h1, .post-title, .entry-title, .article-title, .elementor-heading-title').first().text();
    return this.cleanText(title);
  }

  scoreContentRoot($root, metaTitle, urlSlug) {
    if (!$root || !$root.length || this.isInExcludedArea($root)) {
      return 0;
    }

    const text = this.getRootText($root);
    if (!text || text.length < 180) {
      return 0;
    }

    const tagName = ($root.get(0)?.tagName || '').toLowerCase();
    const rootTitle = this.getRootTitle($root);
    const paragraphCount = $root.find('p').length;
    const headingCount = $root.find('h1, h2, h3').length;
    const imageCount = $root.find('img').length;

    let score = Math.min(60, Math.floor(text.length / 120));
    if (tagName === 'article') score += 40;
    if (tagName === 'main') score += 25;
    if (rootTitle) score += 24;
    if (headingCount > 0) score += Math.min(18, headingCount * 6);
    if (paragraphCount >= 3) score += Math.min(24, paragraphCount * 3);
    if (imageCount > 0) score += 8;
    if (metaTitle && rootTitle && this.stringsAreRelated(rootTitle, metaTitle)) score += 60;
    if (metaTitle && text.includes(metaTitle.slice(0, 60))) score += 18;
    const hasMatchingLink = urlSlug && $root.find('a[href]').filter((_, element) => {
      const href = this.$(element).attr('href') || '';
      return this.normalizeComparisonText(href).includes(urlSlug);
    }).length > 0;

    if (urlSlug && (this.normalizeComparisonText(text).includes(urlSlug) || hasMatchingLink)) {
      score += 24;
    }

    return score;
  }

  findPrimaryContentRoot() {
    if (this.primaryContentCache) {
      return this.primaryContentCache;
    }

    const $ = this.$;
    const metaTitle = this.getMetaTitle();
    const urlSlug = this.getUrlSlugText();
    const candidates = [];
    const seen = new Set();

    const articleFromUrl = this.findArticleForCurrentUrl($);
    if (articleFromUrl && articleFromUrl.length) {
      candidates.push(articleFromUrl.first());
    }

    if (this.options.contentSelector) {
      try {
        $(this.options.contentSelector).each((_, element) => {
          candidates.unshift($(element));
        });
      } catch {
        // Ignore invalid custom selectors and fall back to heuristics.
      }
    }

    [
      '[data-elementor-type="single-post"]',
      'main article',
      'article.post',
      'article',
      '.single-post',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.news-content',
      '.content-body',
      'main',
      '#content',
      '.content',
      '#main',
      '.main',
    ].forEach((selector) => {
      $(selector).each((_, element) => {
        const root = $(element);
        const key = root.html();

        if (!key || seen.has(key)) {
          return;
        }

        seen.add(key);
        candidates.push(root);
      });
    });

    let bestRoot = null;
    let bestScore = 0;

    candidates.forEach((candidate) => {
      const score = this.scoreContentRoot(candidate, metaTitle, urlSlug);
      if (score > bestScore) {
        bestScore = score;
        bestRoot = candidate;
      }
    });

    this.primaryContentCache = bestScore >= 45 ? bestRoot : null;
    return this.primaryContentCache;
  }

  /**
   * Extracts the title of the page
   * Prioritizes the title from the article/content area
   * @returns {string|null}
   */
  extractTitle() {
    const $ = this.$;
    const primaryRoot = this.findPrimaryContentRoot();
    const rootTitle = this.getRootTitle(primaryRoot);
    if (rootTitle) return rootTitle;

    let title = this.getMetaTitle();
    if (title) return title;

    title = $('h1').first().text();
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

    const primaryRoot = this.findPrimaryContentRoot();
    if (primaryRoot && primaryRoot.length) {
      const firstParagraph = primaryRoot.find('p').filter((_, el) => {
        const text = this.cleanText(this.$(el).text());
        return text.length >= 80;
      }).first().text();

      if (firstParagraph) {
        return this.cleanText(firstParagraph);
      }
    }

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
   * Tries to find the content specific to this URL
   * @returns {string}
   */
  extractContentText() {
    const $ = this.$;
    $('script, style, nav, footer, header, aside, form, iframe, noscript').remove();
    $('[style*="display: none"], [style*="display:none"], [hidden]').remove();
    this.removeConfiguredExcludedAreas();

    const primaryRoot = this.findPrimaryContentRoot();
    let content = this.getRootText(primaryRoot);

    if (!content && $('main').length) {
      content = this.cleanText($('main').first().text());
    }

    if (!content && $('article').length) {
      content = this.cleanText($('article').first().text());
    }

    if (!content) {
      content = this.cleanText($('body').text());
    }

    return this.cleanText(content);
  }

  /**
   * Finds the article element that corresponds to the current URL
   * @param {Function} $ - cheerio selector
   * @returns {Object|null}
   */
  findArticleForCurrentUrl($) {
    const url = this.baseUrl;
    const urlSlug = url.split('/').filter(Boolean).pop() || '';
    const normalizedSlug = this.normalizeComparisonText(urlSlug.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '));
    const metaTitle = this.getMetaTitle();
    
    const articleWithPermalink = $('article').filter((_, el) => {
      const $el = $(el);
      const href = $el.find('a[href]').filter((__, link) => {
        const linkHref = $(link).attr('href') || '';
        return this.normalizeComparisonText(linkHref).includes(normalizedSlug);
      }).first().attr('href');
      const dataPermalink = $el.attr('data-permalink') || $el.attr('data-url');
      return dataPermalink === url || (href && this.normalizeComparisonText(href).includes(normalizedSlug));
    });
    
    if (articleWithPermalink.length) {
      return articleWithPermalink.first();
    }
    
    const postsWithH1 = $('article, .post, .entry').filter((_, el) => {
      const $el = $(el);
      const h1 = $el.find('h1, h2.post-title, .entry-title').first();
      if (h1.length && metaTitle) {
        const h1Text = h1.text().trim();
        return h1Text === metaTitle || metaTitle.includes(h1Text) || h1Text.includes(metaTitle.substring(0, 30));
      }
      return false;
    });
    
    if (postsWithH1.length) {
      return postsWithH1.first();
    }
    
    const firstArticle = $('article').first();
    if (firstArticle.length) {
      const h1 = firstArticle.find('h1').first();
      if (h1.length) {
        return firstArticle;
      }
    }
    
    return null;
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
   * Extracts pagination links such as "next", "proxima" and numbered pagination URLs.
   * These links are used only to continue discovery through listing pages.
   * @returns {string[]}
   */
  extractPaginationLinks() {
    const links = new Set();
    const baseDomain = extractDomain(this.baseUrl);
    const selectors = [
      'a[rel="next"]',
      'link[rel="next"]',
      '.pagination a[href]',
      '.paginacao a[href]',
      '.nav-links a[href]',
      '.page-numbers a[href]',
      'a.next[href]',
      'a[aria-label*="Next" i]',
      'a[aria-label*="Proxima" i]',
      'a[aria-label*="Próxima" i]',
    ];

    selectors.forEach((selector) => {
      this.$(selector).each((_, el) => {
        const href = this.$(el).attr('href');
        if (!href) return;

        const fullUrl = this.resolveUrl(href);
        const linkDomain = extractDomain(fullUrl);
        if (linkDomain !== baseDomain) return;

        const normalized = this.normalizeUrlForStorage(fullUrl);
        if (normalized && this.isValidCrawlUrl(normalized)) {
          links.add(normalized);
        }
      });
    });

    this.$('a[href]').each((_, el) => {
      const label = this.cleanText(this.$(el).text()).toLowerCase();
      if (!/(proxima|próxima|seguinte|next|mais|older|antigos)/i.test(label)) return;

      const href = this.$(el).attr('href');
      const fullUrl = this.resolveUrl(href);
      if (extractDomain(fullUrl) !== baseDomain) return;

      const normalized = this.normalizeUrlForStorage(fullUrl);
      if (normalized && this.isValidCrawlUrl(normalized)) {
        links.add(normalized);
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
   * Extracts the cover image (main image) from the page
   * Prioritizes: Open Graph image > Twitter image > First image in main content
   * @returns {Object|null} Cover image object
   */
  extractCoverImage() {
    const $ = this.$;
    const seen = new Set();
    const primaryRoot = this.findPrimaryContentRoot();

    if (primaryRoot && primaryRoot.length) {
      const rootImage = this.extractImageFromRoot(primaryRoot);
      if (rootImage) {
        return rootImage;
      }
    }

    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[property="og:image:url"]',
    ];

    for (const selector of selectors) {
      const content = $(selector).attr('content');
      if (content) {
        const src = this.resolveUrl(content);
        if (src && !seen.has(src)) {
          seen.add(src);
          return {
            src,
            alt: $('meta[property="og:title"]').attr('content') || this.extractTitle() || '',
            title: '',
            context: 'Cover image (Open Graph)',
            filename: src.split('/').pop().split('.')[0],
            width: 0,
            height: 0,
            isOg: true,
            isCover: true,
          };
        }
      }
    }

    return null;
  }

  extractImageFromRoot($root) {
    if (!$root || !$root.length) {
      return null;
    }

    const $img = $root.find('img').filter((_, element) => {
      const candidate = this.$(element);
      if (this.isInExcludedArea(candidate)) {
        return false;
      }

      const src = candidate.attr('src') || candidate.attr('data-src') || '';
      if (!src || src.startsWith('data:')) {
        return false;
      }

      const width = parseInt(candidate.attr('width'), 10) || 0;
      const height = parseInt(candidate.attr('height'), 10) || 0;

      if (width > 0 && height > 0 && (width < 160 || height < 160)) {
        return false;
      }

      return true;
    }).first();

    if (!$img.length) {
      return null;
    }

    const src = this.resolveUrl($img.attr('src') || $img.attr('data-src'));
    if (!src) {
      return null;
    }

    return {
      src,
      alt: this.cleanText($img.attr('alt')) || this.getRootTitle($root) || this.extractTitle() || '',
      title: this.cleanText($img.attr('title')) || '',
      context: 'Cover image (content)',
      filename: src.split('/').pop().split('.')[0].replace(/[-_]/g, ' '),
      width: parseInt($img.attr('width'), 10) || 0,
      height: parseInt($img.attr('height'), 10) || 0,
      isOg: false,
      isCover: true,
    };
  }

  /**
   * Checks if an element is in a footer/sidebar area (should be excluded)
   */
  isInExcludedArea($el) {
    const excludedSelectors = [
      'footer',
      '.footer',
      '#footer',
      'aside',
      '.sidebar',
      '#sidebar',
      '.related-posts',
      '.related-articles',
      '.recommended',
      '.more-stories',
      '.newsletter',
      '.social-share',
      '.comments',
      '#comments',
      '.advertisement',
      '.ad',
      '.ads',
      ...this.options.excludeSelectors,
    ];

    for (const selector of excludedSelectors) {
      if ($el.closest(selector).length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extracts all images from the page with context (excluding footer/sidebar)
   * Now returns only the cover image (main image) - 1 image only
   * @returns {Object[]} Array of image objects
   */
  extractImages() {
    const images = [];
    const seen = new Set();
    const primaryRoot = this.findPrimaryContentRoot();
    const rootImage = this.extractImageFromRoot(primaryRoot);

    if (rootImage?.src) {
      seen.add(rootImage.src);
      images.push(rootImage);
    }

    if (images.length === 0) {
      const ogImage = this.$('meta[property="og:image"]').attr('content');
      if (ogImage) {
        const resolvedOg = this.resolveUrl(ogImage);
        if (resolvedOg) seen.add(resolvedOg);
        images.push({
          src: resolvedOg,
          alt: this.$('meta[property="og:title"]').attr('content') || this.extractTitle() || '',
          title: '',
          context: 'Cover image',
          filename: '',
          width: 0,
          height: 0,
          isOg: true,
        });
      }
    }

    return images.slice(0, 1);
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
      paginationLinks: this.extractPaginationLinks(),
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
    $('script, style, nav, footer, header, aside, form, iframe, noscript').remove();
    $('[style*="display: none"], [style*="display:none"], [hidden]').remove();
    this.removeConfiguredExcludedAreas();

    const primaryRoot = this.findPrimaryContentRoot();
    if (primaryRoot && primaryRoot.length) {
      return primaryRoot.html();
    }

    if ($('main').length) {
      return $('main').first().html();
    }

    return $('body').html();
  }

  removeConfiguredExcludedAreas() {
    if (!this.options.excludeSelectors.length) {
      return;
    }

    this.options.excludeSelectors.forEach((selector) => {
      try {
        this.$(selector).remove();
      } catch {
        // Ignore invalid selectors from source config.
      }
    });
  }
}

module.exports = HtmlParser;
