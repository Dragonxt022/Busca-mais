const axios = require('axios');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('@napi-rs/canvas');
const Tesseract = require('tesseract.js');
const XLSX = require('xlsx');
const textCleaner = require('../../../utils/textCleaner');

const execFileAsync = promisify(execFile);

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

class CatalogDocumentContentService {
  constructor() {
    this.maxCharacters = 50000;
    this.requestTimeoutMs = 30000;
    this.execFileAsync = execFileAsync;
    this.ocrMaxPages = 15;
    this.ocrMinTextRatio = 0.45;
  }

  isOleCompoundDocument(buffer) {
    if (!buffer || buffer.length < 8) {
      return false;
    }

    const oleHeader = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    return buffer.subarray(0, 8).equals(oleHeader);
  }

  looksLikeZipContainer(buffer) {
    if (!buffer || buffer.length < 4) {
      return false;
    }

    return buffer.subarray(0, 4).toString('binary') === 'PK\x03\x04';
  }

  extractTextLikeContent(buffer) {
    const utf8Text = this.normalizeText(buffer.toString('utf8'));
    const latin1Text = this.normalizeText(buffer.toString('latin1'));
    const candidates = [utf8Text, latin1Text].filter(Boolean);

    const bestCandidate = candidates
      .filter((value) => /[a-zA-ZÀ-ÿ]{3,}/.test(value))
      .sort((left, right) => right.length - left.length)[0];

    return bestCandidate || '';
  }

  buildExtractionResult(text, type, info = {}) {
    const processed = textCleaner.processText(text, { maxLength: this.maxCharacters });

    return {
      info,
      blocks: processed.blocks,
      hasContent: processed.has_content,
      markdown: this.toMarkdown(processed.clean_text),
      numpages: 0,
      numrender: 0,
      text: processed.clean_text,
      textLength: processed.clean_text.length,
      type,
    };
  }

  async extractDocViaLibreOffice(tempFile) {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'busca-plus-soffice-'));
    const outputFile = path.join(outputDir, `${path.basename(tempFile, path.extname(tempFile))}.txt`);
    const commands = ['soffice', 'libreoffice'];
    let lastError = null;

    try {
      for (const command of commands) {
        try {
          await this.execFileAsync(command, [
            '--headless',
            '--convert-to',
            'txt:Text',
            '--outdir',
            outputDir,
            tempFile,
          ], {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 30000,
          });

          const output = await fs.readFile(outputFile, 'utf8');
          const text = this.normalizeText(output);

          if (!text) {
            throw new Error(`Nenhum texto util foi extraido via ${command}`);
          }

          return this.buildExtractionResult(text, 'doc', { fallback: command });
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError || new Error('LibreOffice indisponivel para extracao');
    } finally {
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  detectFileType(downloadUrl, contentType, buffer) {
    const normalizedContentType = String(contentType || '').toLowerCase();
    const normalizedUrl = String(downloadUrl || '').toLowerCase();

    if (normalizedContentType.includes('application/pdf') || normalizedUrl.includes('.pdf') || normalizedUrl.includes('extencao=pdf')) {
      return 'pdf';
    }

    if (normalizedContentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      || normalizedUrl.includes('.docx')
      || normalizedUrl.includes('extencao=docx')) {
      return 'docx';
    }

    if (normalizedContentType.includes('application/msword') || /\.doc(?:\?|$)/i.test(normalizedUrl) || normalizedUrl.includes('extencao=doc')) {
      return 'doc';
    }

    if (normalizedContentType.includes('application/vnd.ms-excel')
      || /\.xls(?:\?|$)/i.test(normalizedUrl)
      || normalizedUrl.includes('extencao=xls')) {
      return 'xls';
    }

    if (normalizedContentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      || normalizedUrl.includes('.xlsx')
      || normalizedUrl.includes('extencao=xlsx')) {
      return 'xlsx';
    }

    if (buffer.subarray(0, 4).toString('utf8') === '%PDF') {
      return 'pdf';
    }

    return 'unknown';
  }

  toMarkdown(text) {
    return textCleaner.cleanMarkdown(text, {
      maxLength: this.maxCharacters,
      title: 'Documento',
    });
  }

  normalizeText(text) {
    if (!text) {
      return '';
    }

    const normalized = text
      .replace(/\r/g, '\n')
      .replace(/\u0000/g, ' ')
      .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, ' ')
      .replace(/^\s*page\s+\d+\s*$/gim, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return textCleaner.cleanText(normalized, { maxLength: this.maxCharacters });
  }

  looksLikeGarbage(text) {
    if (!text || text.length < 20) return true;
    const latinChars = (text.match(/[a-zA-ZÀ-ÿ0-9\s.,;:!?()\-\/]/g) || []).length;
    return (latinChars / text.length) < this.ocrMinTextRatio;
  }

  async renderPageToImageBuffer(page) {
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const canvasFactory = new NodeCanvasFactory();
    const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

    await page.render({ canvasContext: context, viewport, canvasFactory }).promise;

    const imageBuffer = canvas.toBuffer('image/png');
    canvasFactory.destroy({ canvas, context });
    return imageBuffer;
  }

  async extractPdfViaOcr(buffer) {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      isEvalSupported: false,
    });

    const pdfDoc = await loadingTask.promise;
    const maxPages = Math.min(pdfDoc.numPages, this.ocrMaxPages);
    const worker = await Tesseract.createWorker('por');
    const texts = [];

    try {
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const imgBuffer = await this.renderPageToImageBuffer(page);
        const { data: { text } } = await worker.recognize(imgBuffer);
        const normalized = this.normalizeText(text);
        if (normalized) texts.push(normalized);
      }
    } finally {
      await worker.terminate();
    }

    const fullText = texts.join('\n\n').trim();
    if (!fullText) throw new Error('OCR nao extraiu texto util do PDF');

    return {
      ...this.buildExtractionResult(fullText, 'pdf', { ocr: true }),
      numpages: pdfDoc.numPages,
      numrender: maxPages,
    };
  }

  async extractPdf(buffer) {
    let data;
    let pdfParseError;

    try {
      data = await pdfParse(buffer);
    } catch (err) {
      pdfParseError = err;
    }

    const text = data ? this.normalizeText(data.text) : '';

    if (!text || this.looksLikeGarbage(text)) {
      try {
        return await this.extractPdfViaOcr(buffer);
      } catch (ocrError) {
        if (pdfParseError) throw pdfParseError;
        throw new Error(`Nenhum texto util foi extraido do PDF: ${ocrError.message}`);
      }
    }

    return {
      ...this.buildExtractionResult(text, 'pdf', data.info || {}),
      numpages: data.numpages || 0,
      numrender: data.numrender || 0,
    };
  }

  async extractDoc(buffer) {
    const tempFile = path.join(os.tmpdir(), `busca-plus-${Date.now()}.doc`);

    try {
      if (this.looksLikeZipContainer(buffer)) {
        return this.extractDocx(buffer);
      }

      if (!this.isOleCompoundDocument(buffer)) {
        const text = this.extractTextLikeContent(buffer);

        if (text) {
          return {
            info: { fallback: 'text-decoder' },
            markdown: this.toMarkdown(text),
            numpages: 0,
            numrender: 0,
            text,
            textLength: text.length,
            type: 'doc',
          };
        }

        throw new Error('Arquivo DOC invalido ou nao suportado para extracao textual');
      }

      await fs.writeFile(tempFile, buffer);
      let stdout = '';

      try {
        ({ stdout } = await this.execFileAsync('antiword', [tempFile], {
          maxBuffer: 10 * 1024 * 1024,
        }));
      } catch (error) {
        const stderr = String(error.stderr || '').trim();
        const output = String(error.stdout || '').trim();
        const message = `${error.message || ''} ${stderr} ${output}`.trim();

        if (/not a Word Document/i.test(message)) {
          try {
            return await this.extractDocViaLibreOffice(tempFile);
          } catch (libreOfficeError) {
            const textFallback = this.extractTextLikeContent(buffer);

            if (textFallback) {
              return this.buildExtractionResult(textFallback, 'doc', {
                fallback: 'text-decoder',
                antiwordError: stderr || error.message,
                libreOfficeError: libreOfficeError.message,
              });
            }
          }

          const textFallback = this.extractTextLikeContent(buffer);

          if (textFallback) {
            return this.buildExtractionResult(textFallback, 'doc', {
              fallback: 'text-decoder',
              antiwordError: stderr || error.message,
            });
          }

          throw new Error('Arquivo DOC nao e um Word valido');
        }

        throw error;
      }

      const text = this.normalizeText(stdout);
      if (!text) {
        throw new Error('Nenhum texto util foi extraido do DOC');
      }

      return this.buildExtractionResult(text, 'doc');
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  }

  async extractDocx(buffer) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = this.normalizeText(value);

    if (!text) {
      throw new Error('Nenhum texto util foi extraido do DOCX');
    }

    return this.buildExtractionResult(text, 'docx');
  }

  async extractSpreadsheet(buffer, type) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetTexts = workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        blankrows: false,
      });

      const body = rows
        .map((row) => row.filter(Boolean).join(' | ').trim())
        .filter(Boolean)
        .join('\n');

      return body ? `## ${sheetName}\n${body}` : '';
    }).filter(Boolean);

    const text = this.normalizeText(sheetTexts.join('\n\n'));
    if (!text) {
      throw new Error(`Nenhum texto util foi extraido do ${type.toUpperCase()}`);
    }

    return this.buildExtractionResult(text, type, { sheets: workbook.SheetNames });
  }

  async extractFromDocumentUrl(downloadUrl) {
    if (!downloadUrl) {
      throw new Error('Download URL do documento nao informada');
    }

    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: this.requestTimeoutMs,
      maxContentLength: 20 * 1024 * 1024,
      maxBodyLength: 20 * 1024 * 1024,
      headers: {
        'User-Agent': 'BuscaPlusCatalogIndexer/1.0',
      },
    });

    const buffer = Buffer.from(response.data);
    const fileType = this.detectFileType(downloadUrl, response.headers?.['content-type'], buffer);

    if (fileType === 'pdf') {
      return this.extractPdf(buffer);
    }

    if (fileType === 'doc') {
      return this.extractDoc(buffer);
    }

    if (fileType === 'docx') {
      return this.extractDocx(buffer);
    }

    if (fileType === 'xls' || fileType === 'xlsx') {
      return this.extractSpreadsheet(buffer, fileType);
    }

    throw new Error('Formato de arquivo nao suportado para extracao textual');
  }
}

module.exports = new CatalogDocumentContentService();
