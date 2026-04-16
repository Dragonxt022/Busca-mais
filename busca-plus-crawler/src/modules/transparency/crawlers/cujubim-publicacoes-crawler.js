const { chromium } = require('playwright');
const crypto = require('crypto');

const BASE_URL = 'https://transparencia.cujubim.ro.gov.br';
const LIST_URL =
  'https://transparencia.cujubim.ro.gov.br/transparencia/index.php?link=aplicacoes/publicacao/frmpublicacao&nomeaplicacao=publicacao&id_menu=10&token=6d6e26202c8c5da5c5da66b7c6c7d349';

class CujubimPublicacoesCrawler {
  constructor({ logger, pageDelayMs = 800, maxPages = null, headless = true } = {}) {
    this.logger = logger || console;
    this.pageDelayMs = pageDelayMs;
    this.maxPages = maxPages;
    this.headless = headless;
  }

  async crawlCatalog() {
    const browser = await chromium.launch({
      headless: this.headless,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    const results = [];
    const seenKeys = new Set();

    try {
      this.logger.info(`[catalog] Abrindo listagem: ${LIST_URL}`);
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      this.logger.info(`[catalog] Alterando quantidade por página para 100`);
      await this._setPageSize(page, 100);
      await page.waitForTimeout(2000);

      await this._waitForTable(page);
      await page.waitForTimeout(2000);

      const totalRowsInfo = await page.evaluate(() => {
        const rows = document.querySelectorAll('table tbody tr');
        return rows.length;
      });
      this.logger.info(`[catalog] Total de linhas visíveis após ajuste: ${totalRowsInfo}`);

      let currentPage = 1;
      let keepGoing = true;

      while (keepGoing) {
        if (this.maxPages && currentPage > this.maxPages) break;

        this.logger.info(`[catalog] Lendo página ${currentPage}`);

        const rows = await this._extractRows(page);
        this.logger.info(`[catalog] Página ${currentPage}: ${rows.length} linhas capturadas`);

        if (!rows.length) break;

        let newRowsThisPage = 0;

        for (const row of rows) {
          const normalized = this._enrichRowFast(row, currentPage);

          if (!normalized || !normalized.external_id) {
            this.logger.warn(
              `[catalog] Linha sem external_id. descricao="${row.descricao || ''}"`
            );
            continue;
          }

          const dedupeKey = `${normalized.external_id}`;
          if (seenKeys.has(dedupeKey)) continue;

          seenKeys.add(dedupeKey);
          results.push(normalized);
          newRowsThisPage++;
        }

        this.logger.info(
          `[catalog] Página ${currentPage}: ${newRowsThisPage} documentos válidos adicionados`
        );

        const nextWorked = await this._goToNextPage(page);
        if (!nextWorked) {
          keepGoing = false;
        } else {
          currentPage += 1;
          await page.waitForTimeout(this.pageDelayMs);
        }
      }

      return results;
    } finally {
      await browser.close();
    }
  }

  async _setPageSize(page, quantity) {
    try {
      this.logger.info(`[catalog] Alterando quantidade para ${quantity} via formulário...`);
      
      const result = await page.evaluate(async (qty) => {
        const input = document.querySelector('input[name="txtquantidade"]');
        if (!input) return { success: false, error: 'Input não encontrado' };
        
        input.value = qty;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        
        const form = input.closest('form');
        if (form) {
          form.submit();
          return { success: true, method: 'form_submit' };
        }
        
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
        const listarBtn = buttons.find(b => 
          b.textContent?.toLowerCase().includes('listar') ||
          b.value?.toLowerCase().includes('listar')
        );
        
        if (listarBtn) {
          listarBtn.click();
          return { success: true, method: 'button_click' };
        }
        
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }));
        
        return { success: true, method: 'enter_key' };
      }, quantity);

      this.logger.info(`[catalog] Resultado: ${JSON.stringify(result)}`);
      
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3000);
      
      this.logger.info(`[catalog] Quantidade alterada para ${quantity}`);
    } catch (error) {
      this.logger.warn(`[catalog] Não foi possível alterar quantidade: ${error.message}`);
    }
  }

  async _waitForTable(page) {
    const selectors = [
      'table tbody tr',
      '.table tbody tr',
      '#tblResultado tbody tr',
      'table tr',
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        return;
      } catch (_) {}
    }

    throw new Error('Tabela de publicações não encontrada');
  }

  async _extractRows(page) {
    const rows = await page.evaluate((baseUrl) => {
      const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

      const normalizeUrl = (href) => {
        if (!href) return null;
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (href.startsWith('/')) return `${baseUrl}${href}`;
        return `${baseUrl}/transparencia/${href.replace(/^\.?\//, '')}`;
      };

      const tableRows = Array.from(document.querySelectorAll('table tbody tr'));
      return tableRows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 6) return null;
        
        const anchors = Array.from(tr.querySelectorAll('a'));

        const detalheAnchor =
          anchors.find((a) => /detalh|individual|codigo|hash_md5/i.test(a.href || '')) || null;

        const pdfAnchor =
          anchors.find((a) => /download\.php/i.test(a.href || '') || /pdf/i.test(a.href || '')) ||
          null;

        const tipo = text(cells[0]);
        const numero_ano = text(cells[1]);
        const data_documento = text(cells[2]);
        const data_publicacao = text(cells[3]);
        const descricao = text(cells[4]);
        const ementa = text(cells[5]);
        
        if (!tipo && !descricao) return null;

        return {
          tipo,
          numero_ano,
          data_documento,
          data_publicacao,
          descricao,
          ementa,
          detalhe_url: normalizeUrl(detalheAnchor?.getAttribute('href') || null),
          pdf_url_hint: normalizeUrl(pdfAnchor?.getAttribute('href') || null),
          raw_text: text(tr),
        };
      }).filter(Boolean);
    }, BASE_URL);

    return rows.filter((row) => row.raw_text);
  }

  _enrichRowFast(row, pageNumber) {
    let externalId = this._extractIdFromUrl(row.pdf_url_hint);
    let downloadUrl = row.pdf_url_hint || null;

    if (!externalId && row.detalhe_url) {
      externalId = this._extractIdFromUrl(row.detalhe_url);
    }

    if (!externalId && row.detalhe_url) {
      const codigo = this._extractCodigoFromUrl(row.detalhe_url);
      if (codigo) {
        externalId = codigo;
        if (!downloadUrl) downloadUrl = this._buildPdfUrl(codigo);
      }
    }

    if (!externalId) return null;

    const rowHash = this._hashRow({
      externalId,
      tipo: row.tipo,
      numero_ano: row.numero_ano,
      data_documento: row.data_documento,
      data_publicacao: row.data_publicacao,
      descricao: row.descricao,
      ementa: row.ementa,
      downloadUrl,
    });

    return {
      source_name: 'cujubim_transparencia_publicacoes',
      external_id: externalId,
      extension: 'PDF',
      tipo: row.tipo || null,
      numero_ano: row.numero_ano || null,
      data_documento: row.data_documento || null,
      data_publicacao: row.data_publicacao || null,
      descricao: row.descricao || null,
      ementa: row.ementa || null,
      detalhe_url: row.detalhe_url || null,
      download_url: downloadUrl || this._buildPdfUrl(externalId),
      pagina_origem: pageNumber,
      row_hash: rowHash,
      status: 'pending',
      metadata_json: {
        raw_text: row.raw_text,
      },
    };
  }

  async _enrichRowWithDocumentId(context, row, pageNumber) {
    let externalId = this._extractIdFromUrl(row.pdf_url_hint);
    let downloadUrl = row.pdf_url_hint || null;

    if (!externalId && row.detalhe_url) {
      const detailData = await this._extractFromDetailPage(context, row.detalhe_url);
      externalId = detailData.externalId || null;
      downloadUrl = detailData.downloadUrl || downloadUrl;
    }

    if (!externalId && row.detalhe_url) {
      const codigo = this._extractCodigoFromUrl(row.detalhe_url);
      if (codigo) {
        externalId = codigo;
        downloadUrl = this._buildPdfUrl(codigo);
      }
    }

    if (!externalId) return null;

    const rowHash = this._hashRow({
      externalId,
      tipo: row.tipo,
      numero_ano: row.numero_ano,
      data_documento: row.data_documento,
      data_publicacao: row.data_publicacao,
      descricao: row.descricao,
      ementa: row.ementa,
      downloadUrl,
    });

    return {
      source_name: 'cujubim_transparencia_publicacoes',
      external_id: externalId,
      extension: 'PDF',
      tipo: row.tipo || null,
      numero_ano: row.numero_ano || null,
      data_documento: row.data_documento || null,
      data_publicacao: row.data_publicacao || null,
      descricao: row.descricao || null,
      ementa: row.ementa || null,
      detalhe_url: row.detalhe_url || null,
      download_url: downloadUrl || this._buildPdfUrl(externalId),
      pagina_origem: pageNumber,
      row_hash: rowHash,
      status: 'pending',
      metadata_json: {
        raw_text: row.raw_text,
      },
    };
  }

  async _extractFromDetailPage(context, detailUrl) {
    const page = await context.newPage();
    try {
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      const data = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));

        const pdfLink =
          anchors.find((a) => /download\.php/i.test(a.href || '') || /extencao=PDF/i.test(a.href || ''))
            ?.href || null;

        return { pdfLink };
      });

      const externalId = this._extractIdFromUrl(data.pdfLink || '');
      return {
        externalId,
        downloadUrl: data.pdfLink,
      };
    } catch (error) {
      this.logger.warn(`[catalog] Falha ao abrir detalhe: ${detailUrl} - ${error.message}`);
      return { externalId: null, downloadUrl: null };
    } finally {
      await page.close();
    }
  }

  async _goToNextPage(page) {
    const before = await page.locator('table').first().textContent().catch(() => '');

    const candidateSelectors = [
      'a:has-text("próximo")',
      'a:has-text("proximoo")',
      'a.pg',
      'a[href*="pagina="]',
      '.pagination a:last-child:not([href*="pagina=0"])',
      'a:has-text("»")',
    ];

    for (const selector of candidateSelectors) {
      try {
        const locator = page.locator(selector).first();
        if ((await locator.count()) === 0) continue;
        
        const href = await locator.getAttribute('href').catch(() => null);
        if (!href || href.includes('pagina=0')) continue;

        await locator.click({ timeout: 5000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(this.pageDelayMs);

        const after = await page.locator('table').first().textContent().catch(() => '');
        if (after && after !== before) return true;
      } catch (_) {}
    }

    return false;
  }

  _extractIdFromUrl(url) {
    if (!url) return null;
    const match = String(url).match(/[?&]id_doc=(\d+)/i);
    return match ? match[1] : null;
  }

  _extractCodigoFromUrl(url) {
    if (!url) return null;
    const match = String(url).match(/[?&]codigo=(\d+)/i);
    return match ? match[1] : null;
  }

  _buildPdfUrl(id) {
    return `${BASE_URL}/transparencia/aplicacoes/publicacao/download.php?id_doc=${id}&extencao=PDF`;
  }

  _normalizeBrDate(value) {
    if (!value) return null;
    value = String(value).trim();
    
    const patterns = [
      { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, format: (m) => `${m[3]}-${m[2]}-${m[1]}` },
      { regex: /^(\d{4})-(\d{2})-(\d{2})$/, format: (m) => m[0] },
      { regex: /^(\d{2})-(\d{2})-(\d{4})$/, format: (m) => `${m[3]}-${m[2]}-${m[1]}` },
    ];
    
    for (const p of patterns) {
      const match = value.match(p.regex);
      if (match) return p.format(match);
    }
    
    return value;
  }

  _hashRow(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

module.exports = { CujubimPublicacoesCrawler };