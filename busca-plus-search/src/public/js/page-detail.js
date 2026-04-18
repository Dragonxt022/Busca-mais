(function pageDetail() {
  const content = document.querySelector('[data-reading-content="true"]');
  const toggle = document.querySelector('[data-reading-toggle="true"]');
  const summaryTrigger = document.querySelector('[data-ai-summary-trigger="true"]');
  const summaryCard = document.querySelector('[data-ai-summary-card="true"]');
  const summaryStatus = document.querySelector('[data-ai-summary-status="true"]');
  const summaryOutput = document.querySelector('[data-ai-summary-output="true"]');
  const summaryMeta = document.querySelector('[data-ai-summary-meta="true"]');
  const summaryButtonLabel = document.querySelector('[data-ai-summary-button-label="true"]');

  if (toggle) {
    toggle.hidden = true;
  }

  if (!content) {
    return;
  }

  function escapeRegExp(string) {
    return String(string || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function getQueryTokens(query) {
    return Array.from(new Set(
      String(query || '')
        .split(/[^a-z0-9\u00C0-\u017F]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
        .map((token) => token.toLowerCase())
    ));
  }

  function setSearchDisplay(query) {
    const displayEl = document.getElementById('searchQueryDisplay');
    if (displayEl) {
      displayEl.textContent = query || '';
    }
  }

  function highlightText(root, query) {
    const tokens = getQueryTokens(query);

    if (tokens.length === 0) {
      return [];
    }

    const testRegex = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join('|')})`, 'i');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent || parent.closest('mark, script, style, noscript')) {
          return NodeFilter.FILTER_REJECT;
        }

        return testRegex.test(normalizeText(node.textContent))
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const textNodes = [];
    let current = walker.nextNode();

    while (current) {
      textNodes.push(current);
      current = walker.nextNode();
    }

    textNodes.forEach((node) => {
      const text = node.textContent;
      const fragment = document.createDocumentFragment();
      const rawRegex = new RegExp(`(${tokens.map((token) => escapeRegExp(token)).join('|')})`, 'gi');
      let lastIndex = 0;
      let match = rawRegex.exec(text);

      while (match) {
        const matchText = match[0];
        const matchIndex = match.index;

        if (matchIndex > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
        }

        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = matchText;
        fragment.appendChild(mark);

        lastIndex = matchIndex + matchText.length;
        match = rawRegex.exec(text);
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      node.parentNode.replaceChild(fragment, node);
    });

    return Array.from(root.querySelectorAll('.search-highlight'));
  }

  function scoreElement(text, focus, queryTokens) {
    const normalizedText = normalizeText(text);

    if (!normalizedText) {
      return 0;
    }

    let score = 0;

    if (focus) {
      if (normalizedText.includes(focus)) {
        score += 1000;
      }

      focus.split(/\s+/)
        .filter((token) => token.length >= 3)
        .forEach((token) => {
          if (normalizedText.includes(token)) {
            score += 20;
          }
        });
    }

    queryTokens.forEach((token) => {
      if (normalizedText.includes(normalizeText(token))) {
        score += 8;
      }
    });

    return score;
  }

  function findBestTarget(root, query, focus) {
    const normalizedFocus = normalizeText(focus);
    const queryTokens = getQueryTokens(query);
    const candidates = Array.from(root.querySelectorAll('p, li, blockquote, h2, h3, h4'));

    let bestElement = null;
    let bestScore = 0;

    candidates.forEach((element) => {
      const score = scoreElement(element.textContent, normalizedFocus, queryTokens);
      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
      }
    });

    if (bestElement) {
      return bestElement;
    }

    return root.querySelector('.search-highlight');
  }

  function scrollToTarget(target) {
    if (!target) {
      return;
    }

    const highlight = target.classList?.contains('search-highlight')
      ? target
      : target.querySelector('.search-highlight');

    if (target.classList) {
      target.classList.add('search-target-block');
    }

    const scrollTarget = highlight || target;

    window.setTimeout(() => {
      scrollTarget.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });

      if (highlight) {
        highlight.classList.add('highlight-pulse');
        window.setTimeout(() => {
          highlight.classList.remove('highlight-pulse');
        }, 1600);
      }
    }, 250);
  }

  const query = typeof window.searchQuery !== 'undefined'
    ? window.searchQuery
    : document.body.dataset.searchQuery || '';
  const focus = typeof window.searchFocus !== 'undefined'
    ? window.searchFocus
    : document.body.dataset.searchFocus || '';
  const pageId = document.body.dataset.pageId || '';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSummary(summary) {
    const lines = String(summary || '')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const bulletLines = lines.filter((line) => /^[-*•]\s+/.test(line));
    const paragraphLines = lines.filter((line) => !/^[-*•]\s+/.test(line));
    const fragments = [];

    if (paragraphLines.length > 0) {
      paragraphLines.forEach((line) => {
        fragments.push(`<p>${escapeHtml(line)}</p>`);
      });
    }

    if (bulletLines.length > 0) {
      fragments.push(`<ul>${bulletLines.map((line) => `<li>${escapeHtml(line.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`);
    }

    return fragments.join('') || `<p>${escapeHtml(summary)}</p>`;
  }

  async function requestAiSummary() {
    if (!summaryTrigger || !summaryCard || !summaryStatus || !summaryOutput || !pageId) {
      return;
    }

    summaryTrigger.disabled = true;
    summaryTrigger.classList.add('is-loading');
    if (summaryButtonLabel) {
      summaryButtonLabel.textContent = 'Pensando...';
    }

    summaryCard.hidden = false;
    summaryStatus.textContent = 'A IA esta analisando o documento';
    summaryStatus.classList.add('is-thinking');
    summaryOutput.innerHTML = '';
    if (summaryMeta) {
      summaryMeta.textContent = '';
    }

    try {
      const response = await fetch(`/api/page/${encodeURIComponent(pageId)}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Falha ao gerar resumo com IA');
      }

      summaryStatus.classList.remove('is-thinking');
      summaryStatus.textContent = 'Resumo gerado com sucesso.';
      summaryOutput.innerHTML = renderSummary(payload.summary);
      if (summaryMeta) {
        summaryMeta.textContent = [payload.provider, payload.model].filter(Boolean).join(' • ');
      }
    } catch (error) {
      summaryStatus.classList.remove('is-thinking');
      summaryStatus.textContent = error.message || 'Falha ao gerar resumo com IA.';
      summaryOutput.innerHTML = '';
    } finally {
      summaryTrigger.disabled = false;
      summaryTrigger.classList.remove('is-loading');
      if (summaryButtonLabel) {
        summaryButtonLabel.textContent = 'Resumir com IA';
      }
    }
  }

  setSearchDisplay(query);
  highlightText(content, query);
  scrollToTarget(findBestTarget(content, query, focus));

  summaryTrigger?.addEventListener('click', requestAiSummary);
}());

// Reading content — scroll-reveal each section
(function readingReveal() {
  var readingContent = document.getElementById('readingContent');
  if (!readingContent || !('IntersectionObserver' in window)) {
    return;
  }

  var sections = readingContent.querySelectorAll(
    'p, h2, h3, h4, ul, ol, blockquote, dl, .document-table-wrap'
  );

  var delay = 0;
  var resetTimer = null;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      var d = delay;
      delay = Math.min(delay + 40, 200);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { delay = 0; }, 120);
      setTimeout(function () { el.classList.add('is-visible'); }, d);
      observer.unobserve(el);
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -24px 0px' });

  sections.forEach(function (el) {
    el.classList.add('reading-reveal');
    observer.observe(el);
  });
}());
