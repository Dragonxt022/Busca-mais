const DEFAULT_EMPTY_CONTENT = 'Nenhum conteudo textual disponivel.';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const normalizeLine = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const isUppercaseHeading = (line) => {
  const normalized = normalizeLine(line);
  if (!normalized || normalized.length > 90) return false;
  const lettersOnly = normalized.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (lettersOnly.length < 6) return false;
  return normalized === normalized.toUpperCase();
};

const isStructuredHeading = (line) => /^(capitulo|se[cç][aã]o|subse[cç][aã]o|t[ií]tulo|anexo|ap[eê]ndice|livro|parte|art\.|artigo)\b/i.test(normalizeLine(line));
const isFieldLine = (line) => /^([A-ZÀ-Ý][^:]{1,40}):\s+(.+)$/.test(normalizeLine(line));
const isOrderedItem = (line) => /^(\d+[\.\)]|[ivxlcdm]+[\.\)]|[a-z][\.\)])\s+/i.test(normalizeLine(line));
const isUnorderedItem = (line) => /^[-*•]\s+/.test(normalizeLine(line));
const isQuoteLine = (line) => /^>\s+/.test(normalizeLine(line));
const isTableLine = (line) => normalizeLine(line).includes(' | ');
const stripListMarker = (line) => normalizeLine(line).replace(/^((\d+|[ivxlcdm]+|[a-z])[\.\)]|[-*•])\s+/i, '');

const renderParagraphWithBreaks = (lines, className = '') => {
  const safeLines = lines.map((line) => escapeHtml(normalizeLine(line)));
  return `<p${className ? ` class="${className}"` : ''}>${safeLines.join('<br>')}</p>`;
};

const renderTable = (lines) => {
  const rows = lines
    .map((line) => normalizeLine(line).split(/\s+\|\s+/).map((cell) => escapeHtml(cell)))
    .filter((cells) => cells.length > 1);

  if (rows.length === 0) {
    return '';
  }

  const [header, ...body] = rows;
  const headerHtml = `<tr>${header.map((cell) => `<th>${cell}</th>`).join('')}</tr>`;
  const bodyHtml = body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');

  return `<div class="document-table-wrap"><table class="document-table"><thead>${headerHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
};

const stripLeadingDuplicateHeading = (text, title) => {
  const normalizedText = String(text || '').trim();
  const normalizedTitle = normalizeLine(title);

  if (!normalizedText || !normalizedTitle) {
    return normalizedText;
  }

  const lines = normalizedText.split(/\r?\n/);
  const firstLine = normalizeLine(lines[0]);
  const duplicateHeadingPatterns = [
    normalizedTitle.toLowerCase(),
    `# ${normalizedTitle}`.toLowerCase(),
    '# documento',
  ];

  if (duplicateHeadingPatterns.includes(firstLine.toLowerCase())) {
    return lines.slice(1).join('\n').trim();
  }

  return normalizedText;
};

const stripHtmlTags = (value) => String(value || '').replace(/<[^>]*>/g, ' ');

const buildContentPreviewText = (text, maxLength = 850) => {
  const normalized = stripHtmlTags(text)
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return DEFAULT_EMPTY_CONTENT;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength);
  const lastSentence = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('? ')
  );

  if (lastSentence > 280) {
    return `${sliced.slice(0, lastSentence + 1).trim()}...`;
  }

  return `${sliced.trim()}...`;
};

const getFirstImageUrl = (images) => {
  if (!Array.isArray(images) || images.length === 0) {
    return '';
  }

  const firstImage = images.find(Boolean);
  if (!firstImage) {
    return '';
  }

  if (typeof firstImage === 'string') {
    return firstImage;
  }

  return firstImage.localPath
    || firstImage.url
    || firstImage.originalUrl
    || firstImage.src
    || '';
};

const formatContentHtml = (text) => {
  if (!text) {
    return `<p>${DEFAULT_EMPTY_CONTENT}</p>`;
  }

  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const htmlBlocks = [];

  blocks.forEach((block) => {
    const lines = block
      .split('\n')
      .map((line) => line.replace(/\t/g, '  '))
      .map((line) => line.replace(/\s+$/g, ''))
      .filter((line) => normalizeLine(line));

    if (lines.length === 0) {
      return;
    }

    if (lines.every((line) => isTableLine(line))) {
      htmlBlocks.push(renderTable(lines));
      return;
    }

    if (lines.every((line) => isFieldLine(line)) && lines.length >= 2) {
      const fieldsHtml = lines.map((line) => {
        const [, label, value] = normalizeLine(line).match(/^([A-ZÀ-Ý][^:]{1,40}):\s+(.+)$/) || [];
        return `<div class="document-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
      }).join('');
      htmlBlocks.push(`<dl class="document-fields">${fieldsHtml}</dl>`);
      return;
    }

    if (lines.length === 1 && isQuoteLine(lines[0])) {
      htmlBlocks.push(`<blockquote>${escapeHtml(normalizeLine(lines[0]).replace(/^>\s+/, ''))}</blockquote>`);
      return;
    }

    if (/^#{1,3}\s+/.test(normalizeLine(lines[0]))) {
      const headingLevel = Math.min(4, normalizeLine(lines[0]).match(/^#+/)[0].length + 1);
      htmlBlocks.push(`<h${headingLevel}>${escapeHtml(normalizeLine(lines[0]).replace(/^#{1,3}\s+/, ''))}</h${headingLevel}>`);
      if (lines.length > 1) {
        htmlBlocks.push(renderParagraphWithBreaks(lines.slice(1)));
      }
      return;
    }

    if (isUppercaseHeading(lines[0]) || isStructuredHeading(lines[0])) {
      htmlBlocks.push(`<h3 class="document-section-title">${escapeHtml(normalizeLine(lines[0]))}</h3>`);
      if (lines.length > 1) {
        htmlBlocks.push(renderParagraphWithBreaks(lines.slice(1)));
      }
      return;
    }

    if (lines.every((line) => isUnorderedItem(line))) {
      htmlBlocks.push(`<ul>${lines.map((line) => `<li>${escapeHtml(stripListMarker(line))}</li>`).join('')}</ul>`);
      return;
    }

    if (lines.every((line) => isOrderedItem(line))) {
      htmlBlocks.push(`<ol>${lines.map((line) => `<li>${escapeHtml(stripListMarker(line))}</li>`).join('')}</ol>`);
      return;
    }

    if (lines.length > 1 && lines.every((line) => !/[.!?;:]$/.test(normalizeLine(line)) && normalizeLine(line).length <= 80)) {
      htmlBlocks.push(renderParagraphWithBreaks(lines, 'document-lines'));
      return;
    }

    if (lines.some((line) => isQuoteLine(line))) {
      lines.forEach((line) => {
        if (isQuoteLine(line)) {
          htmlBlocks.push(`<blockquote>${escapeHtml(normalizeLine(line).replace(/^>\s+/, ''))}</blockquote>`);
          return;
        }

        htmlBlocks.push(renderParagraphWithBreaks([line]));
      });
      return;
    }

    htmlBlocks.push(renderParagraphWithBreaks(lines, lines.length > 1 ? 'document-compact-paragraph' : ''));
  });

  return htmlBlocks.join('');
};

const buildPageViewModel = ({
  page,
  query = '',
  focus = '',
  aiFeatures = null,
} = {}) => {
  const safeTitle = page?.title || 'Detalhes do documento';
  const readableContent = stripLeadingDuplicateHeading(page?.markdownContent || page?.content || '', safeTitle);
  const isCatalogDocument = page?.recordType === 'catalog_document';
  const openUrl = page?.openUrl || page?.downloadUrl || page?.url || '#';
  const sourceHref = page?.sourceLinkUrl || page?.sourceUrl || page?.url || '#';
  const leadText = String(page?.summary || page?.description || readableContent || DEFAULT_EMPTY_CONTENT)
    .replace(/\s+/g, ' ')
    .trim();
  const originalLabel = isCatalogDocument ? 'Ver documento original' : 'Ver materia original';
  const sourceName = page?.sourceName || page?.domain || 'site da fonte';
  const copyrightNotice = `Imagem e material original pertencem ao site da fonte: ${sourceName}.`;

  const documentMetaItems = [
    { label: 'Tipo', value: page?.documentType || '' },
    { label: 'Numero', value: page?.documentNumber || '' },
    { label: 'Documento', value: page?.documentDate || '' },
    { label: 'Publicacao', value: page?.publicationDate || '' },
    { label: 'Fonte', value: page?.sourceName || '' },
  ].filter((item) => item.value);

  return {
    page,
    query,
    focus,
    safeTitle,
    isCatalogDocument,
    openUrl,
    sourceHref,
    leadExcerpt: leadText.length > 400
      ? `${leadText.slice(0, 400).trim()}...`
      : leadText,
    featuredImage: page?.coverImage
      || getFirstImageUrl(page?.images)
      || page?.featuredImage
      || page?.screenshotUrl
      || page?.imageUrl
      || page?.coverThumbnail
      || page?.thumbnailUrl
      || '',
    featuredCaption: page?.coverAlt || page?.imageCaption || page?.thumbnailCaption || '',
    publishedDate: page?.publicationDate || page?.documentDate || '',
    snapshotDate: page?.crawledAt ? new Date(page.crawledAt).toLocaleString('pt-BR') : '',
    documentMetaItems,
    contentPreviewHtml: `<p>${escapeHtml(buildContentPreviewText(readableContent))}</p>`,
    originalLabel,
    copyrightNotice,
    formattedContentHtml: formatContentHtml(readableContent),
    aiPageEnabled: false,
  };
};

module.exports = {
  buildPageViewModel,
  formatContentHtml,
};
