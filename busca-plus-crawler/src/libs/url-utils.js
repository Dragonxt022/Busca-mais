const crypto = require('crypto');

/**
 * Normalizes a URL by removing fragments and trailing slashes
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove fragment
    parsed.hash = '';
    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    // Sort query params
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Generates a SHA-256 hash of a URL
 * @param {string} url - URL to hash
 * @returns {string} Hash of the URL
 */
function hashUrl(url) {
  const normalized = normalizeUrl(url);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Generates a URL slug from a URL or title
 * @param {string} url - URL to generate slug from
 * @param {string} title - Optional title to use instead
 * @returns {string} URL-friendly slug
 */
function generateSlug(url, title = null) {
  if (title) {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 200);
  }
  
  try {
    const parsed = new URL(url);
    return parsed.pathname
      .replace(/^\//, '')
      .replace(/\/$/, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 200) || 'index';
  } catch {
    return 'unknown';
  }
}

/**
 * Extracts the domain from a URL
 * @param {string} url - URL to extract domain from
 * @returns {string} Domain name
 */
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Checks if a URL belongs to the same domain as another URL
 * @param {string} url1 - First URL
 * @param {string} url2 - Second URL
 * @returns {boolean} True if same domain
 */
function isSameDomain(url1, url2) {
  const domain1 = extractDomain(url1);
  const domain2 = extractDomain(url2);
  return domain1 === domain2;
}

/**
 * Validates if a string is a valid URL
 * @param {string} url - String to validate
 * @returns {boolean} True if valid URL
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves a relative URL against a base URL
 * @param {string} relativeUrl - Relative URL
 * @param {string} baseUrl - Base URL
 * @returns {string} Resolved absolute URL
 */
function resolveUrl(relativeUrl, baseUrl) {
  try {
    return new URL(relativeUrl, baseUrl).toString();
  } catch {
    return relativeUrl;
  }
}

/**
 * Filters out URLs with unwanted extensions
 * @param {string} url - URL to check
 * @param {string[]} extensions - Extensions to filter out
 * @returns {boolean} True if URL should be kept
 */
function filterUrlExtensions(url, extensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.exe', '.dmg', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.mp3', '.mp4', '.avi', '.mov']) {
  const lowerUrl = url.toLowerCase();
  return !extensions.some(ext => lowerUrl.endsWith(ext));
}

module.exports = {
  normalizeUrl,
  hashUrl,
  generateSlug,
  extractDomain,
  isSameDomain,
  isValidUrl,
  resolveUrl,
  filterUrlExtensions,
};