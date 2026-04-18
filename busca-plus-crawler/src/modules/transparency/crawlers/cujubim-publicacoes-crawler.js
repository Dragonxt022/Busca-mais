const { chromium } = require('playwright');
const crypto = require('crypto');
const { buildChromiumLaunchOptions } = require('../../../libs/playwright-utils');

const BASE_URL = 'https://transparencia.cujubim.ro.gov.br';
const LIST_URL =
  'https://transparencia.cujubim.ro.gov.br/transparencia/index.php?link=aplicacoes/publicacao/frmpublicacao&nomeaplicacao=publicacao&id_menu=10&token=6d6e26202c8c5da5c5da66b7c6c7d349';

class CujubimPublicacoesCrawler {
  constructor({
    logger,
    pageDelayMs = 800,
    maxPages = null,
    headless = true,
    shouldContinue = async () => true,
  } = {}) {
    this.logger = logger || console;
    this.pageDelayMs = pageDelayMs;
    this.maxPages = maxPages;
    this.headless = headless;
    this.shouldContinue = shouldContinue;
    this.maxConsecutiveEmptyPages = 5;
  }

  async crawlCatalog() {
    const browser = await chromium.launch(buildChromiumLaunchOptions({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }));

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.setDefaultNavigationTimeout(45000);
    
    const results = [];
    const seenKeys = new Set();
    const seenPageFingerprints = new Set();

    try {
      this.logger.info(`[catalog] Abrindo listagem: ${LIST_URL}`);
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      this.logger.info('[catalog] Pagina carregada');

      this.logger.info('[catalog] Alterando quantidade por pagina para 100');
      await this._setPageSize(page, 100);
      
      try {
        await this._waitForTable(page);
        this.logger.info('[catalog] Tabela encontrada');
      } catch (e) {
        this.logger.error(`[catalog] Falha ao encontrar tabela: ${e.message}`);
      }
      
      await page.waitForTimeout(2000);

      const totalRowsInfo = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      this.logger.info(`[catalog] Total de linhas visiveis apos ajuste: ${totalRowsInfo}`);

      let currentPage = 1;
      let keepGoing = true;
      let consecutiveEmptyPages = 0;

      while (keepGoing) {
        if (this.maxPages && currentPage > this.maxPages) {
          this.logger.info('[catalog] Limite de paginas atingido');
          break;
        }

        if (!(await this.shouldContinue())) {
          this.logger.info('[catalog] Execucao interrompida externamente');
          break;
        }

        this.logger.info(`[catalog] Lendo pagina ${currentPage}`);

        const rows = await this._extractRows(page);
        this.logger.info(`[catalog] Pagina ${currentPage}: ${rows.length} linhas capturadas`);

        if (!rows.length) {
          this.logger.warn(`[catalog] Nenhuma linha encontrada na pagina ${currentPage}`);
          break;
        }

        const pageFingerprint = this._buildPageFingerprint(rows);
        if (seenPageFingerprints.has(pageFingerprint)) {
          this.logger.warn(`[catalog] Pagina repetida detectada na iteracao ${currentPage}. Encerrando para evitar loop.`);
          break;
        }
        seenPageFingerprints.add(pageFingerprint);

        let newRowsThisPage = 0;

        for (const row of rows) {
          const normalized = this._enrichRowFast(row, currentPage);

          if (!normalized || !normalized.external_id) {
            this.logger.warn(`[catalog] Linha sem external_id. descricao="${row.descricao || ''}"`);
            continue;
          }

          const dedupeKey = String(normalized.external_id);
          if (seenKeys.has(dedupeKey)) {
            continue;
          }

          seenKeys.add(dedupeKey);
          results.push(normalized);
          newRowsThisPage += 1;
        }

        this.logger.info(`[catalog] Pagina ${currentPage}: ${newRowsThisPage} documentos validos adicionados`);

        if (newRowsThisPage === 0) {
          consecutiveEmptyPages += 1;
          if (consecutiveEmptyPages >= this.maxConsecutiveEmptyPages) {
            this.logger.warn(`[catalog] ${consecutiveEmptyPages} paginas consecutivas sem documentos validos. Encerrando.`);
            break;
          }
        } else {
          consecutiveEmptyPages = 0;
        }

        const nextWorked = await this._goToNextPage(page);
        if (!nextWorked) {
          this.logger.info('[catalog] Nao ha mais paginas');
          keepGoing = false;
        } else {
          currentPage += 1;
          await page.waitForTimeout(this.pageDelayMs);
        }
      }

      this.logger.info(`[catalog] Catalogacao concluida. Total: ${results.length} documentos`);
      return results;
    } catch (error) {
      this.logger.error(`[catalog] Erro na catalogacao: ${error.message}`);
      throw error;
    } finally {
      await browser.close().catch(e => this.logger.error(`[catalog] Erro ao fechar browser: ${e.message}`));
    }
  }

  async _setPageSize(page, quantity) {
    try {
      this.logger.info(`[catalog] Alterando quantidade para ${quantity} via formulario...`);

      const result = await page.evaluate(async (qty) => {
        const input = document.querySelector('input[name="txtquantidade"]');
        if (!input) {
          return { success: false, error: 'Input nao encontrado' };
        }

        input.value = qty;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        const form = input.closest('form');
        if (form) {
          form.submit();
          return { success: true, method: 'form_submit' };
        }

        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
        const listarBtn = buttons.find((button) =>
          button.textContent?.toLowerCase().includes('listar') ||
          button.value?.toLowerCase().includes('listar')
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
      
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
      } catch (e) {
        this.logger.warn(`[catalog] Timeout no waitForLoadState: ${e.message}`);
      }
      
      await page.waitForTimeout(2000);
      this.logger.info(`[catalog] Pagina pronta apos alteracao de quantidade`);
    } catch (error) {
      this.logger.warn(`[catalog] Nao foi possivel alterar quantidade: ${error.message}`);
    }
  }

  async _waitForTable(page) {
    const selectors = ['table tbody tr', '.table tbody tr', '#tblResultado tbody tr', 'table tr', '#table-publicacao'];

    for (const selector of selectors) {
      try {
        this.logger.debug(`[catalog] Procurando seletor: ${selector}`);
        await page.waitForSelector(selector, { timeout: 15000 });
        this.logger.debug(`[catalog] Seletor encontrado: ${selector}`);
        return;
      } catch (_) {
        this.logger.debug(`[catalog] Seletor nao encontrado: ${selector}`);
      }
    }

    const pageContent = await page.content().catch(() => '');
    const hasTable = pageContent.includes('<table');
    const hasTablePublicacao = pageContent.includes('table-publicacao');
    this.logger.warn(`[catalog] Tabela nao encontrada. Has table: ${hasTable}, Has table-publicacao: ${hasTablePublicacao}`);
    
    throw new Error('Tabela de publicacoes nao encontrada');
  }

  async _extractRows(page) {
    const rows = await page.evaluate((baseUrl) => {
      const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const cleanCatalogText = (value) => {
        const normalized = (value || '').replace(/\s+/g, ' ').trim();

        if (!normalized) {
          return null;
        }

        if (/^detalhar$/i.test(normalized)) {
          return null;
        }

        return normalized;
      };

      const normalizeUrl = (href) => {
        if (!href) return null;
        if (href.startsWith('http://') || href.startsWith('https://')) return href;
        if (href.startsWith('/')) return `${baseUrl}${href}`;
        return `${baseUrl}/transparencia/${href.replace(/^\.?\//, '')}`;
      };

      const extractPopupUrl = (anchor) => {
        const onclick = anchor?.getAttribute('onclick') || '';
        const match = onclick.match(/popup\('([^']+)'/i);
        return match ? normalizeUrl(match[1]) : null;
      };

      const table = document.querySelector('#table-publicacao') || document.querySelector('table.table');
      const tableRows = Array.from(table?.querySelectorAll('tr') || []);
      return tableRows.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        if (cells.length < 10) return null;

        const anchors = Array.from(tr.querySelectorAll('a'));
        const detalheAnchor = anchors.find((a) => /detalhar/i.test(text(a)) || /detalhe_documento\.php/i.test(a.getAttribute('onclick') || '')) || null;
        const fileAnchor =
          anchors.find((a) => /download\.php/i.test(a.getAttribute('href') || '') || /extencao=(pdf|doc|docx|xls|xlsx)/i.test(a.getAttribute('href') || '')) ||
          null;

        const tipo = cleanCatalogText(text(cells[1]));
        const numero_ano = cleanCatalogText(text(cells[2]));
        const data_documento = cleanCatalogText(text(cells[3]));
        const data_publicacao = cleanCatalogText(text(cells[4]));
        const descricao = cleanCatalogText(text(cells[5]));
        const ementa = cleanCatalogText(text(cells[6]));

        if (!tipo && !descricao) return null;
        if (!detalheAnchor && !fileAnchor) return null;

        return {
          tipo,
          numero_ano,
          data_documento,
          data_publicacao,
          descricao,
          ementa,
          detalhe_url: extractPopupUrl(detalheAnchor),
          pdf_url_hint: normalizeUrl(fileAnchor?.getAttribute('href') || null),
          raw_text: text(tr),
        };
      }).filter(Boolean);
    }, BASE_URL);

    return rows.filter((row) => row.raw_text);
  }

  _enrichRowFast(row, pageNumber) {
    let externalId = this._extractIdFromUrl(row.pdf_url_hint);
    let downloadUrl = row.pdf_url_hint || null;
    let extension = this._extractExtensionFromUrl(downloadUrl) || 'PDF';

    if (!externalId && row.detalhe_url) {
      externalId = this._extractIdFromUrl(row.detalhe_url);
    }

    if (!externalId && row.detalhe_url) {
      const codigo = this._extractCodigoFromUrl(row.detalhe_url);
      if (codigo) {
        externalId = codigo;
        if (!downloadUrl) downloadUrl = this._buildDownloadUrl(codigo, extension);
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
      extension,
    });

    return {
      source_name: 'cujubim_transparencia_publicacoes',
      external_id: externalId,
      extension,
      tipo: row.tipo || null,
      numero_ano: row.numero_ano || null,
      data_documento: row.data_documento || null,
      data_publicacao: row.data_publicacao || null,
      descricao: row.descricao || null,
      ementa: row.ementa || null,
      detalhe_url: row.detalhe_url || null,
      download_url: downloadUrl || this._buildDownloadUrl(externalId, extension),
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
        const fileLink =
          anchors.find((a) => /download\.php/i.test(a.href || '') || /extencao=(PDF|DOC|DOCX|XLS|XLSX)/i.test(a.href || ''))
            ?.href || null;

        return { fileLink };
      });

      const externalId = this._extractIdFromUrl(data.fileLink || '');
      return {
        externalId,
        extension: this._extractExtensionFromUrl(data.fileLink || '') || 'PDF',
        downloadUrl: data.fileLink,
      };
    } catch (error) {
      this.logger.warn(`[catalog] Falha ao abrir detalhe: ${detailUrl} - ${error.message}`);
      return { externalId: null, downloadUrl: null, extension: null };
    } finally {
      await page.close();
    }
  }

  async _goToNextPage(page) {
    const before = await page.locator('table').first().textContent().catch(() => '');
    const candidateSelectors = [
      'a:has-text("próximo")',
      'a:has-text("proximo")',
      'a[rel="next"]',
      'a:has-text("»")',
      'a:has-text(">>")',
    ];

    for (const selector of candidateSelectors) {
      try {
        const locator = page.locator(selector).first();
        if ((await locator.count()) === 0) continue;

        const href = await locator.getAttribute('href').catch(() => null);
        if (!href || href.includes('pagina=0')) continue;

        this.logger.debug(`[catalog] Clicando no link de proxima pagina: ${href}`);
        await locator.click({ timeout: 5000 });
        
        try {
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        } catch (e) {
          this.logger.warn(`[catalog] Timeout na navegacao: ${e.message}`);
        }
        
        await page.waitForTimeout(this.pageDelayMs);

        const after = await page.locator('table').first().textContent().catch(() => '');
        if (after && after !== before) {
          this.logger.debug('[catalog] Navegou para proxima pagina com sucesso');
          return true;
        }
      } catch (_) {
        // try next selector
      }
    }

    this.logger.debug('[catalog] Nenhum link de proxima pagina encontrado');
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

  _buildDownloadUrl(id, extension = 'PDF') {
    return `${BASE_URL}/transparencia/aplicacoes/publicacao/download.php?id_doc=${id}&extencao=${String(extension || 'PDF').toUpperCase()}`;
  }

  _extractExtensionFromUrl(url) {
    if (!url) return null;

    const extencaoMatch = String(url).match(/[?&]extencao=([a-z0-9]+)/i);
    if (extencaoMatch) {
      return extencaoMatch[1].toUpperCase();
    }

    const extensionMatch = String(url).match(/\.([a-z0-9]{3,4})(?:\?|$)/i);
    return extensionMatch ? extensionMatch[1].toUpperCase() : null;
  }

  _buildPageFingerprint(rows) {
    const signature = rows
      .map((row) => row.pdf_url_hint || row.detalhe_url || row.raw_text || '')
      .filter(Boolean)
      .slice(0, 20)
      .join('|');

    return this._hashRow(signature || 'empty-page');
  }

  _hashRow(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

module.exports = { CujubimPublicacoesCrawler };
