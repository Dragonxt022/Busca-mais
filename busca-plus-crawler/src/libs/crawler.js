const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const crypto = require('crypto');
const { logger } = require('./logger');
const { hashUrl, extractDomain } = require('./url-utils');
const HtmlParser = require('./html-parser');
const config = require('../config');

// Image processing constants
const IMAGES_DIR_NAME = 'images';
const MAX_IMAGE_SIZE = 1024 * 1024 * 2; // 2MB max per image
const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 240;

class Crawler {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000;
    this.userAgent = options.userAgent || 'BuscaPlus/1.0 (+https://buscaplus.com/bot)';
    this.screenshotDir = options.screenshotDir || path.join(process.cwd(), 'screenshots');
    this.viewport = options.viewport || { width: 1280, height: 720 };
    this.waitForSelector = options.waitForSelector || null;
    this.waitForTimeout = options.waitForTimeout || 2000;
    this.browser = null;
    this.context = null;
  }

  /**
   * Initialize the browser
   */
  async init() {
    // Ensure screenshot directory exists
    await fs.mkdir(this.screenshotDir, { recursive: true });

    this.browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: this.userAgent,
      viewport: this.viewport,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    });

    logger.info('Crawler browser initialized');
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      logger.info('Crawler browser closed');
    }
  }

  /**
   * Crawls a single page
   * @param {string} url - URL to crawl
   * @param {Object} options - Crawl options
   * @returns {Object} Crawl result
   */
  async crawlPage(url, options = {}) {
    const {
      takeScreenshot = false,
      extractLinks = false,
      followRedirects = true,
    } = options;

    const startTime = Date.now();
    let page = null;

    try {
      // Ensure browser is initialized
      if (!this.browser) {
        await this.init();
      }

      page = await this.context.newPage();

      // Set timeout
      page.setDefaultTimeout(this.timeout);

      // Navigate to URL
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: this.timeout,
      });

      // Check status code
      const statusCode = response.status();
      if (statusCode >= 400) {
        throw new Error(`HTTP ${statusCode} for ${url}`);
      }

      // Wait for specific selector if provided
      if (this.waitForSelector) {
        await page.waitForSelector(this.waitForSelector, { timeout: 5000 });
      }

      // Wait for additional content to load
      await page.waitForTimeout(this.waitForTimeout);

      // Get final URL after redirects
      const finalUrl = page.url();

      // Get HTML content
      const html = await page.content();

      // Get page title
      const title = await page.title();

      // Parse HTML
      const parser = new HtmlParser(html, finalUrl);
      const parsedData = parser.extractAll();

      // Process images from the page
      let processedImages = [];
      if (parsedData.images && parsedData.images.length > 0) {
        processedImages = await this.processImages(parsedData.images, finalUrl);
      }

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      return {
        success: true,
        url: finalUrl,
        originalUrl: url,
        statusCode,
        responseTimeMs: responseTime,
        title: parsedData.title || title,
        description: parsedData.description,
        contentText: parsedData.contentText,
        contentHtml: parsedData.contentHtml,
        canonicalUrl: parsedData.canonicalUrl,
        favicon: parsedData.favicon,
        language: parsedData.language,
        wordCount: parsedData.wordCount,
        slug: parsedData.slug,
        metadata: parsedData.metadata,
        processedImages,
        hashUrl: hashUrl(finalUrl),
        hashContent: hashUrl(parsedData.contentText || ''),
        internalLinks: extractLinks ? parsedData.internalLinks : [],
        html,
      };
    } catch (error) {
      logger.error(`Error crawling ${url}:`, error.message);
      return {
        success: false,
        url,
        originalUrl: url,
        statusCode: error.status || 500,
        error: error.message,
        responseTimeMs: Date.now() - startTime,
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Takes a screenshot of the page
   * @param {Page} page - Playwright page object
   * @param {string} url - URL for filename
   * @returns {string} Path to screenshot
   */
  async takeScreenshot(page, url) {
    try {
      const domain = extractDomain(url);
      const timestamp = Date.now();
      const filename = `${domain.replace(/\./g, '-')}-${timestamp}.png`;
      const filepath = path.join(this.screenshotDir, filename);

      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle');

      // Take full page screenshot
      await page.screenshot({
        path: filepath,
        fullPage: true,
      });

      logger.debug(`Screenshot saved: ${filepath}`);
      return filepath;
    } catch (error) {
      logger.warn(`Failed to take screenshot for ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Crawls multiple pages
   * @param {string[]} urls - URLs to crawl
   * @param {Object} options - Crawl options
   * @returns {Object[]} Crawl results
   */
  async crawlPages(urls, options = {}) {
    const results = [];

    for (const url of urls) {
      const result = await this.crawlPage(url, options);
      results.push(result);

      // Add delay between requests to be polite
      if (options.delay && options.delay > 0) {
        await this.delay(options.delay);
      }
    }

    return results;
  }

  /**
   * Checks if a URL is accessible
   * @param {string} url - URL to check
   * @returns {Object} Check result
   */
  async checkUrl(url) {
    let page = null;

    try {
      if (!this.browser) {
        await this.init();
      }

      page = await this.context.newPage();
      page.setDefaultTimeout(10000);

      const response = await page.headless?.(url) || await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 10000,
      });

      const statusCode = response?.status() || 200;

      return {
        accessible: statusCode < 400,
        statusCode,
        url: page.url(),
      };
    } catch (error) {
      return {
        accessible: false,
        statusCode: error.status || 500,
        error: error.message,
        url,
      };
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Downloads and processes images from a page
   * @param {Object[]} images - Array of image objects from parser
   * @param {string} pageUrl - Source page URL
   * @returns {Object[]} Processed images with local paths
   */
  async processImages(images, pageUrl) {
    if (!images || images.length === 0) return [];

    const imagesDir = path.join(this.screenshotDir, '..', IMAGES_DIR_NAME);
    await fs.mkdir(imagesDir, { recursive: true });

    const processedImages = [];
    const domain = extractDomain(pageUrl);
    const pageHash = hashUrl(pageUrl).substring(0, 8);

    for (const img of images.slice(0, 10)) { // Limit to 10 images per page
      try {
        const result = await this.downloadAndCompressImage(img.src, imagesDir, domain, pageHash);
        if (result) {
          processedImages.push({
            originalUrl: img.src,
            localPath: result.localPath,
            thumbnailPath: result.thumbnailPath,
            alt: img.alt || '',
            title: img.title || '',
            width: img.width || result.width,
            height: img.height || result.height,
          });
        }
      } catch (error) {
        logger.debug(`Failed to process image ${img.src}: ${error.message}`);
      }
    }

    return processedImages;
  }

  /**
   * Downloads and compresses a single image
   * @param {string} imageUrl - Image URL to download
   * @param {string} destDir - Destination directory
   * @param {string} domain - Domain for filename
   * @param {string} pageHash - Page hash for filename
   * @returns {Object|null} Processed image info
   */
  async downloadAndCompressImage(imageUrl, destDir, domain, pageHash) {
    // Create unique filename
    const urlHash = hashUrl(imageUrl).substring(0, 12);
    const baseFilename = `${domain.replace(/\./g, '-')}-${pageHash}-${urlHash}`;
    
    try {
      // Use fetch to download image
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': this.userAgent,
        },
        timeout: 15000,
      });

      if (!response.ok) return null;

      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) return null;

      // Check size
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > MAX_IMAGE_SIZE) return null;

      // Get image buffer
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 100) return null; // Skip tiny images

      // Determine extension
      let ext = '.jpg';
      if (contentType.includes('png')) ext = '.png';
      else if (contentType.includes('gif')) ext = '.gif';
      else if (contentType.includes('webp')) ext = '.webp';

      const filename = baseFilename + ext;
      const thumbnailFilename = baseFilename + '-thumb' + ext;
      const localPath = path.join(destDir, filename);
      const thumbnailPath = path.join(destDir, thumbnailFilename);

      // Save original image (compressed if needed)
      await fs.writeFile(localPath, buffer);

      // Create thumbnail using sharp if available, otherwise just copy
      try {
        const sharp = require('sharp');
        await sharp(buffer)
          .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toFile(thumbnailPath);
      } catch (sharpError) {
        // Sharp not available, just copy the file
        await fs.copyFile(localPath, thumbnailPath);
      }

      // Get dimensions
      let width = 0, height = 0;
      try {
        const sharp = require('sharp');
        const metadata = await sharp(buffer).metadata();
        width = metadata.width || 0;
        height = metadata.height || 0;
      } catch {}

      return {
        localPath: `${IMAGES_DIR_NAME}/${filename}`,
        thumbnailPath: `${IMAGES_DIR_NAME}/${thumbnailFilename}`,
        width,
        height,
      };
    } catch (error) {
      logger.debug(`Failed to download image ${imageUrl}: ${error.message}`);
      return null;
    }
  }

  /**
   * Helper delay function
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Discovers links on a page
   * @param {string} url - URL to discover links from
   * @param {Object} options - Discovery options
   * @returns {string[]} Discovered URLs
   */
  async discoverLinks(url, options = {}) {
    const { maxLinks = 100, sameDomain = true } = options;

    const result = await this.crawlPage(url, { extractLinks: true, takeScreenshot: false });

    if (!result.success) {
      return [];
    }

    let links = result.internalLinks || [];

    if (sameDomain) {
      const baseDomain = extractDomain(url);
      links = links.filter(link => extractDomain(link) === baseDomain);
    }

    // Limit number of links
    if (links.length > maxLinks) {
      links = links.slice(0, maxLinks);
    }

    return links;
  }
}

module.exports = Crawler;