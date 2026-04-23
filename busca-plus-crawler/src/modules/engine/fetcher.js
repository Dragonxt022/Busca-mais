const https = require('https');
const http = require('http');
const { logger } = require('../../libs/logger');

const DEFAULT_USER_AGENT = 'BuscaPlus/2.0 (+https://buscaplus.com/bot)';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Fetcher HTTP leve (sem browser) para fontes que nao precisam de JS.
 * Retorna { html, buffer, contentType, statusCode, finalUrl }.
 * Usa Playwright como fallback quando o fetch simples falha ou retorna conteudo insuficiente.
 */
class Fetcher {
  constructor(options = {}) {
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.timeout = options.timeout || DEFAULT_TIMEOUT_MS;
  }

  async fetch(url) {
    try {
      return await this._httpFetch(url);
    } catch (err) {
      logger.debug(`Fetcher HTTP falhou para ${url}: ${err.message}. Tentando Playwright.`);
      return await this._browserFetch(url);
    }
  }

  async _httpFetch(url) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const lib = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml,application/json,application/pdf,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        timeout: this.timeout,
      };

      const req = lib.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          const isText = contentType.includes('text/') || contentType.includes('json') || contentType.includes('xml');
          const html = isText ? buffer.toString('utf-8') : null;

          resolve({
            html,
            buffer: isText ? null : buffer,
            contentType,
            statusCode: res.statusCode,
            finalUrl: res.headers.location ? new URL(res.headers.location, url).href : url,
          });
        });
        res.on('error', reject);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout de ${this.timeout}ms ao buscar ${url}`));
      });
      req.on('error', reject);
      req.end();
    });
  }

  async _browserFetch(url) {
    const { chromium } = require('playwright');
    const { buildChromiumLaunchOptions } = require('../../libs/playwright-utils');

    let browser;
    try {
      browser = await chromium.launch(buildChromiumLaunchOptions());
      const context = await browser.newContext({
        userAgent: this.userAgent,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      let contentType = 'text/html';
      page.on('response', (response) => {
        if (response.url() === url || response.url() === page.url()) {
          contentType = response.headers()['content-type'] || 'text/html';
        }
      });

      await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeout });
      const html = await page.content();
      const finalUrl = page.url();

      return { html, buffer: null, contentType, statusCode: 200, finalUrl };
    } finally {
      if (browser) await browser.close();
    }
  }
}

module.exports = Fetcher;
