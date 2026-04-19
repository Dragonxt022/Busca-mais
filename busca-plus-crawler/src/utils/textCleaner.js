const DEFAULT_MAX_LENGTH = 50000;

const NOISE_PATTERNS = [
  /^\s*(notice|warning|deprecated|fatal error|parse error)\b[\s\S]*$/i,
  /^\s*(clique aqui|saiba mais|voltar|detalhar|menu|home)\s*$/i,
  /^\s*(undefined index|undefined variable|stack trace|php message)\b[\s\S]*$/i,
];

function stripInvalidChars(text) {
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\uFFFD/g, ' ');
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n[ ]+/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\s*([:;!?])\s*/g, '$1 ')
    .replace(/(?<!\d)\s*([,.])\s*(?!\d)/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function removeTechnicalNoise(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => !NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .join('\n');
}

function mergeBrokenLines(text) {
  return String(text || '')
    .replace(/([^\n.!?:;])\n(?=[a-z0-9(])/g, '$1 ')
    .replace(/([A-Za-zÀ-ÿ])- \n(?=[A-Za-zÀ-ÿ])/g, '$1')
    .replace(/([A-Za-zÀ-ÿ])-\n(?=[A-Za-zÀ-ÿ])/g, '$1')
    .replace(/([^\n])\n(?=R\$\s*\d)/g, '$1 ');
}

function cleanBlock(block) {
  return normalizeWhitespace(block)
    .replace(/\n+/g, ' ')
    .trim();
}

function signatureForBlock(block) {
  return cleanBlock(block)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasRelevantContent(block) {
  return /[\p{L}\p{N}]{3,}/u.test(block);
}

function isNoiseBlock(block) {
  if (!block || block.length < 3) {
    return true;
  }

  if (!hasRelevantContent(block)) {
    return true;
  }

  return NOISE_PATTERNS.some((pattern) => pattern.test(block));
}

function looksLikeHeading(block) {
  if (!block || block.length > 120 || /[.!?]$/.test(block)) {
    return false;
  }

  const words = block.split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 12;
}

function isLikelyIrrelevantUiBlock(block) {
  if (block.length > 80) {
    return false;
  }

  return /^(entrar|sair|buscar|pesquisar|avancar|proximo|anterior|fechar|abrir)$/i.test(block);
}

function splitIntoRawBlocks(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n')
        .map((line) => normalizeWhitespace(line).trim())
        .filter(Boolean);
      return lines.join('\n');
    })
    .filter(Boolean);
}

function dedupeBlocks(blocks) {
  const seen = new Set();

  return blocks.filter((block) => {
    const signature = signatureForBlock(block);

    if (!signature || seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
}

function limitBlocks(blocks, maxLength) {
  const limited = [];
  let currentLength = 0;

  for (const block of blocks) {
    const separatorLength = limited.length > 0 ? 2 : 0;
    const nextLength = currentLength + separatorLength + block.length;

    if (nextLength > maxLength) {
      const remaining = maxLength - currentLength - separatorLength;
      if (remaining > 0) {
        limited.push(block.slice(0, remaining).trim());
      }
      break;
    }

    limited.push(block);
    currentLength = nextLength;
  }

  return limited.filter(Boolean);
}

function processText(text, options = {}) {
  const { maxLength = DEFAULT_MAX_LENGTH } = options;

  const normalizedInput = normalizeWhitespace(
    mergeBrokenLines(
      removeTechnicalNoise(
        stripHtml(
          stripInvalidChars(text)
        )
      )
    )
  );

  const uniqueBlocks = dedupeBlocks(
    splitIntoRawBlocks(normalizedInput).filter((block) => !isNoiseBlock(block) && !isLikelyIrrelevantUiBlock(block))
  );
  const limitedBlocks = limitBlocks(uniqueBlocks, maxLength);
  const cleanTextValue = limitedBlocks.join('\n\n').trim();

  return {
    clean_text: cleanTextValue,
    blocks: limitedBlocks,
    has_content: cleanTextValue.length > 0,
  };
}

function cleanText(text, options = {}) {
  return processText(text, options).clean_text;
}

function cleanMarkdown(text, options = {}) {
  const { maxLength = DEFAULT_MAX_LENGTH, title = 'Documento' } = options;
  const result = processText(text, { maxLength });

  if (!result.has_content) {
    return '';
  }

  return result.blocks
    .map((block, index) => {
      if (index === 0) {
        return `# ${title}\n\n${block}`;
      }

      if (looksLikeHeading(block)) {
        return `## ${block}`;
      }

      return block;
    })
    .join('\n\n')
    .slice(0, maxLength);
}

module.exports = {
  cleanBlock,
  cleanMarkdown,
  cleanText,
  dedupeBlocks,
  normalizeWhitespace,
  processText,
};
