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

  async function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
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
        throw new Error(data.error?.message || data.message || 'Falha ao gerar relatorio');
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
