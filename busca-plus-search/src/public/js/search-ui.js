(function searchUi() {
  const modal = document.getElementById('imageModal');
  const modalImage = document.getElementById('modalImage');
  const modalTitle = document.getElementById('modalTitle');
  const modalDomain = document.getElementById('modalDomain');
  const modalUrl = document.getElementById('modalUrl');
  const modalUrlText = document.getElementById('modalUrlText');
  const modalOpenBtn = document.getElementById('modalOpenBtn');

  document.querySelectorAll('.clear-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const form = button.closest('form');
      const input = form ? form.querySelector('input[type="text"]') : null;

      if (!input) {
        return;
      }

      input.value = '';
      input.focus();
    });
  });

  if (!modal) {
    return;
  }

  const closeModal = () => {
    modal.classList.remove('open');
  };

  document.querySelectorAll('[data-close-modal="true"]').forEach((element) => {
    element.addEventListener('click', closeModal);
  });

  document.querySelectorAll('.image-card').forEach((card) => {
    card.addEventListener('click', () => {
      const imageSrc = card.dataset.imageSrc || '';
      const title = card.dataset.imageTitle || '';
      const url = card.dataset.imageUrl || '';
      const domain = card.dataset.imageDomain || '';

      modalImage.src = imageSrc;
      modalImage.alt = title;
      modalTitle.textContent = title;
      modalDomain.textContent = domain;
      modalUrl.href = url;
      modalUrlText.textContent = url.length > 50 ? `${url.substring(0, 50)}...` : url;
      modalOpenBtn.href = url;
      modal.classList.add('open');
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });
}());

// Autocomplete com termos mais pesquisados (últimos 7 dias)
(function searchAutocomplete() {
  var DEBOUNCE_MS = 180;

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function initAutoComplete(container) {
    var input = container.querySelector('input[name="q"]');
    var dropdown = container.querySelector('.ac-dropdown');
    var list = dropdown ? dropdown.querySelector('.ac-list') : null;
    if (!input || !dropdown || !list) return;

    var timer = null;
    var activeIdx = -1;
    var items = [];

    function getItems() {
      return Array.from(list.querySelectorAll('.ac-item'));
    }

    function highlight(idx) {
      var elems = getItems();
      var clamped = Math.max(-1, Math.min(idx, elems.length - 1));
      elems.forEach(function (el, i) { el.classList.toggle('ac-active', i === clamped); });
      activeIdx = clamped;
    }

    function render(suggestions) {
      items = suggestions;
      activeIdx = -1;

      if (!suggestions.length) {
        dropdown.hidden = true;
        list.innerHTML = '';
        return;
      }

      var popularItems = suggestions.filter(function (s) { return s.type === 'popular'; });
      var titleItems = suggestions.filter(function (s) { return s.type !== 'popular'; });
      var parts = [];

      if (popularItems.length) {
        parts.push('<li class="ac-section-label"><span class="material-icons" style="font-size:13px;vertical-align:middle;margin-right:3px">trending_up</span>Mais pesquisados — últimos 7 dias</li>');
        popularItems.forEach(function (s, i) {
          var countLabel = s.count > 1 ? '<span class="ac-count">' + s.count + 'x</span>' : '';
          parts.push(
            '<li class="ac-item" role="option" data-idx="' + i + '">' +
            '<span class="material-icons ac-icon ac-icon-popular">local_fire_department</span>' +
            '<span class="ac-text">' + escHtml(s.text) + '</span>' +
            countLabel +
            '</li>'
          );
        });
      }

      if (titleItems.length) {
        if (popularItems.length) parts.push('<li class="ac-divider" aria-hidden="true"></li>');
        titleItems.forEach(function (s, i) {
          var realIdx = popularItems.length + i;
          parts.push(
            '<li class="ac-item" role="option" data-idx="' + realIdx + '">' +
            '<span class="material-icons ac-icon">search</span>' +
            '<span class="ac-text">' + escHtml(s.text) + '</span>' +
            '</li>'
          );
        });
      }

      list.innerHTML = parts.join('');
      dropdown.hidden = false;
    }

    function fetchSuggestions(q) {
      return fetch('/api/suggestions?' + new URLSearchParams({ q: q || '' }), {
        headers: { Accept: 'application/json' },
      })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }

    function selectItem(idx) {
      var item = items[idx];
      if (!item) return;
      input.value = item.text;
      dropdown.hidden = true;
      var form = input.closest('form');
      if (form) form.submit();
    }

    function triggerFetch() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        fetchSuggestions(input.value.trim()).then(render);
      }, DEBOUNCE_MS);
    }

    input.addEventListener('focus', function () {
      clearTimeout(timer);
      fetchSuggestions(input.value.trim()).then(render);
    });

    input.addEventListener('input', triggerFetch);

    input.addEventListener('keydown', function (e) {
      if (dropdown.hidden) return;
      var elems = getItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlight(activeIdx + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight(activeIdx - 1);
      } else if (e.key === 'Enter' && activeIdx >= 0) {
        e.preventDefault();
        selectItem(activeIdx);
      } else if (e.key === 'Escape') {
        dropdown.hidden = true;
        activeIdx = -1;
        void elems;
      }
    });

    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('.ac-item');
      if (!li) return;
      e.preventDefault();
      selectItem(parseInt(li.dataset.idx, 10));
    });

    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) {
        dropdown.hidden = true;
        activeIdx = -1;
      }
    });
  }

  document.querySelectorAll('.search-header').forEach(initAutoComplete);
}());

// Entrance animations — reveal cards as they enter the viewport
(function cardAnimations() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.result-card, .image-card, .side-card').forEach(function (el) {
      el.classList.add('card-visible');
    });
    return;
  }

  function makeStaggerObserver(selector, threshold, rootMargin) {
    var elements = document.querySelectorAll(selector);
    if (!elements.length) return;

    var delay = 0;
    var resetTimer = null;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var d = delay;
        delay = Math.min(delay + 60, 360);
        clearTimeout(resetTimer);
        resetTimer = setTimeout(function () { delay = 0; }, 150);
        el.style.animationDelay = d + 'ms';
        el.classList.add('card-visible');
        observer.unobserve(el);
      });
    }, { threshold: threshold, rootMargin: rootMargin });

    elements.forEach(function (el) { observer.observe(el); });
  }

  makeStaggerObserver('.result-card, .image-card', 0.04, '0px 0px -16px 0px');
  makeStaggerObserver('.side-card', 0.06, '0px');
}());

// AI Search Report
(function aiSearchReport() {
  const reportSection = document.getElementById('aiReportSection');
  const reportLoading = document.getElementById('aiReportLoading');
  const reportContent = document.getElementById('aiReportContent');
  const reportBody = document.getElementById('aiReportBody');
  const reportMeta = document.getElementById('aiReportMeta');
  const reportClose = document.getElementById('aiReportClose');

  if (!reportSection || !reportLoading) {
    return;
  }

  const query = reportSection.dataset.query || '';

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function renderSummary(summary) {
    const lines = String(summary || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);

    const bulletLines = lines.filter(line => /^[-*•]\s+/.test(line));
    const paragraphLines = lines.filter(line => !/^[-*•]\s+/.test(line));
    const fragments = [];

    if (paragraphLines.length > 0) {
      paragraphLines.forEach(line => {
        fragments.push(`<p>${escapeHtml(line)}</p>`);
      });
    }

    if (bulletLines.length > 0) {
      fragments.push(`<ul>${bulletLines.map(line =>
        `<li>${escapeHtml(line.replace(/^[-*•]\s+/, ''))}</li>`
      ).join('')}</ul>`);
    }

    return fragments.join('') || `<p>${escapeHtml(summary)}</p>`;
  }

  async function loadReport() {
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/report?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.error?.message || data.message || 'Falha ao gerar relatorio');
      }

      reportLoading.hidden = true;
      reportContent.hidden = false;

      if (reportMeta) {
        reportMeta.textContent = `${data.provider} • ${data.model}`;
      }

      reportBody.innerHTML = renderSummary(data.summary);

    } catch (error) {
      reportLoading.hidden = true;
      reportContent.hidden = false;
      reportBody.innerHTML = `<div class="ai-report-error"><p>Nao foi possivel gerar o relatorio: ${escapeHtml(error.message)}</p></div>`;
    }
  }

  if (reportClose) {
    reportClose.addEventListener('click', () => {
      reportSection.hidden = true;
    });
  }

  loadReport();
}());

// AI Search Overview (visao geral semantica com embeddings)
(function aiSearchOverview() {
  const section = document.getElementById('aiOverviewSection');
  const loading = document.getElementById('aiOverviewLoading');
  const content = document.getElementById('aiOverviewContent');
  const body = document.getElementById('aiOverviewBody');
  const closeBtn = document.getElementById('aiOverviewClose');
  const expandBtn = document.getElementById('aiOverviewExpand');
  const expandLabel = document.getElementById('aiOverviewExpandLabel');
  const sourcesContainer = document.getElementById('aiOverviewSources');
  const sourcesToggle = document.getElementById('aiOverviewSourcesToggle');
  const sourcesList = document.getElementById('aiOverviewSourcesList');
  const sourcesLabel = document.getElementById('aiOverviewSourcesLabel');

  if (!section || !loading) return;

  const query = section.dataset.query || '';
  const state = section.dataset.state || '';
  const city = section.dataset.city || '';
  const sourceId = section.dataset.source || '';

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function renderSummary(summary) {
    const lines = String(summary || '').split(/\n+/).map(function(l) { return l.trim(); }).filter(Boolean);
    const bullets = lines.filter(function(l) { return /^[-*•]\s+/.test(l); });
    const paragraphs = lines.filter(function(l) { return !/^[-*•]\s+/.test(l); });
    const parts = [];

    paragraphs.forEach(function(line) { parts.push('<p>' + escapeHtml(line) + '</p>'); });

    if (bullets.length > 0) {
      parts.push('<ul>' + bullets.map(function(l) {
        return '<li>' + escapeHtml(l.replace(/^[-*•]\s+/, '')) + '</li>';
      }).join('') + '</ul>');
    }

    return parts.join('') || '<p>' + escapeHtml(summary) + '</p>';
  }

  function renderSources(sources) {
    if (!Array.isArray(sources) || sources.length === 0) return;

    sourcesList.innerHTML = sources.map(function(s) {
      const pct = Math.round((s.score || 0) * 100);
      const title = s.title || 'Documento sem titulo';
      const metaText = [s.sourceName, s.documentType, s.publicationDate].filter(Boolean).join(' · ');
      const href = s.url || '#';
      return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" class="ai-overview-source-item">'
        + '<span class="ai-overview-source-score">' + pct + '%</span>'
        + '<div class="ai-overview-source-info">'
        + '<div class="ai-overview-source-title">' + escapeHtml(title) + '</div>'
        + (metaText ? '<div class="ai-overview-source-meta">' + escapeHtml(metaText) + '</div>' : '')
        + '</div>'
        + '</a>';
    }).join('');

    sourcesContainer.hidden = false;
  }

  async function loadOverview() {
    try {
      const params = new URLSearchParams({ q: query });
      if (state) params.set('state', state);
      if (city) params.set('city', city);
      if (sourceId) params.set('sourceId', sourceId);

      const response = await fetch('/api/ai-overview?' + params.toString());
      const data = await response.json();

      if (!response.ok) {
        loading.hidden = true;
        section.hidden = true;
        return;
      }

      loading.hidden = true;
      content.hidden = false;
      body.innerHTML = renderSummary(data.summary);

      // Mostra o botao "Mostrar mais" somente se o conteudo for maior que o limite visivel
      if (body.scrollHeight > body.offsetHeight + 16) {
        expandBtn.hidden = false;
      } else {
        body.classList.remove('collapsed');
      }

      renderSources(data.sources);

    } catch (_) {
      loading.hidden = true;
      section.hidden = true;
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', function() { section.hidden = true; });
  }

  if (expandBtn) {
    expandBtn.addEventListener('click', function() {
      const isOpen = !body.classList.contains('collapsed');
      if (isOpen) {
        body.classList.add('collapsed');
        expandBtn.classList.remove('open');
        expandLabel.textContent = 'Mostrar mais';
      } else {
        body.classList.remove('collapsed');
        expandBtn.classList.add('open');
        expandLabel.textContent = 'Mostrar menos';
      }
    });
  }

  if (sourcesToggle) {
    sourcesToggle.addEventListener('click', function() {
      const isOpen = !sourcesList.hidden;
      sourcesList.hidden = isOpen;
      sourcesToggle.classList.toggle('open', !isOpen);
      sourcesLabel.textContent = isOpen ? 'Ver fontes usadas' : 'Ocultar fontes';
    });
  }

  loadOverview();
}());
