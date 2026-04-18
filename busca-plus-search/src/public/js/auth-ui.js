(function authUi() {
  const STORAGE_KEY = 'buscaplus-user';
  const SEARCH_COUNT_KEY = 'buscaplus-search-count';
  const PROMPT_DISMISSED_KEY = 'buscaplus-growth-dismissed';
  const PROMPT_DISMISSED_UNTIL_KEY = 'buscaplus-growth-dismissed-until';
  const PROMPT_LAST_SHOWN_KEY = 'buscaplus-growth-last-shown-at';
  const PROMPT_SHOW_COUNT_KEY = 'buscaplus-growth-show-count';
  const PROMPT_SESSION_SHOWN_KEY = 'buscaplus-growth-session-shown';
  const PROMPT_MIN_SEARCHES = 8;
  const PROMPT_MAX_SHOWS = 2;
  const PROMPT_COOLDOWN_MS = 1000 * 60 * 60 * 24 * 21;

  function readUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    document.dispatchEvent(new CustomEvent('buscaplus:user-updated', { detail: user }));
  }

  function clearUser() {
    localStorage.removeItem(STORAGE_KEY);
    document.dispatchEvent(new CustomEvent('buscaplus:user-updated', { detail: null }));
  }

  function getAvatar(user) {
    if (user?.photo) {
      return user.photo;
    }

    const initials = String(user?.name || 'B')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value.charAt(0).toUpperCase())
      .join('') || 'B';

    return `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
        <defs>
          <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#235cff" />
            <stop offset="100%" stop-color="#23c0ff" />
          </linearGradient>
        </defs>
        <rect width="96" height="96" rx="48" fill="url(#g)" />
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="white">${initials}</text>
      </svg>
    `)}`;
  }

  function updateAuthUi() {
    const user = readUser();
    const loginButtons = document.querySelectorAll('[data-auth-open="login"]');
    const profileLinks = document.querySelectorAll('[data-auth-profile-link="true"]');
    const avatars = document.querySelectorAll('[data-auth-avatar="true"]');
    const names = document.querySelectorAll('[data-auth-name="true"]');

    loginButtons.forEach((button) => {
      button.hidden = Boolean(user);
    });

    profileLinks.forEach((link) => {
      link.hidden = !user;
    });

    avatars.forEach((avatar) => {
      avatar.src = getAvatar(user);
    });

    names.forEach((node) => {
      node.textContent = user?.name || 'Meu perfil';
    });
  }

  function setFeedback(message, isError) {
    const feedback = document.querySelector('[data-auth-feedback="true"]');
    if (!feedback) {
      return;
    }

    feedback.hidden = !message;
    feedback.textContent = message || '';
    feedback.classList.toggle('is-error', Boolean(isError));
  }

  const overlay = document.querySelector('[data-auth-overlay="true"]');
  const panels = Array.from(document.querySelectorAll('[data-auth-panel]'));
  const prompt = document.querySelector('[data-growth-prompt="true"]');

  function hideGrowthPrompt() {
    if (prompt) {
      prompt.hidden = true;
    }
  }

  function switchPanel(name) {
    panels.forEach((panel) => {
      const isActive = panel.dataset.authPanel === name;
      panel.classList.toggle('auth-panel-active', isActive);
      panel.hidden = !isActive;
    });
    setFeedback('', false);
  }

  function openAuth(name) {
    if (!overlay) {
      return;
    }

    hideGrowthPrompt();
    switchPanel(name || 'login');
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-modal-open');
  }

  function closeAuth() {
    if (!overlay) {
      return;
    }

    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('auth-modal-open');
    setFeedback('', false);
  }

  document.querySelectorAll('[data-auth-open]').forEach((button) => {
    button.addEventListener('click', () => {
      openAuth(button.dataset.authOpen || 'login');
    });
  });

  document.querySelectorAll('[data-auth-switch]').forEach((button) => {
    button.addEventListener('click', () => {
      switchPanel(button.dataset.authSwitch);
    });
  });

  document.querySelectorAll('[data-auth-close="true"]').forEach((button) => {
    button.addEventListener('click', closeAuth);
  });

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('auth-backdrop')) {
        closeAuth();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.hidden) {
      closeAuth();
    }
  });

  const registerForm = document.querySelector('[data-auth-form="register"]');
  registerForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const name = String(formData.get('name') || '').trim();
    const password = String(formData.get('password') || '');

    if (!email || !name || password.length < 6) {
      setFeedback('Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.', true);
      return;
    }

    const user = {
      name,
      email,
      password,
      region: String(formData.get('region') || '').trim(),
      phone: '',
      interests: '',
      smartSearch: true,
      futureAlerts: false,
      photo: '',
    };

    saveUser(user);
    localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
    setFeedback('Conta criada com sucesso. Seu perfil já está pronto para personalização.', false);
    setTimeout(closeAuth, 600);
  });

  const loginForm = document.querySelector('[data-auth-form="login"]');
  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const user = readUser();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');

    if (!user || user.email !== email || user.password !== password) {
      setFeedback('Não encontramos uma conta local com esse e-mail e senha.', true);
      return;
    }

    saveUser(user);
    localStorage.setItem(PROMPT_DISMISSED_KEY, '1');
    setFeedback('Login realizado com sucesso.', false);
    setTimeout(closeAuth, 500);
  });

  const recoverForm = document.querySelector('[data-auth-form="recover"]');
  recoverForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(recoverForm);
    const user = readUser();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const password = String(formData.get('password') || '');

    if (!user || user.email !== email) {
      setFeedback('Não existe uma conta local cadastrada com esse e-mail.', true);
      return;
    }

    saveUser({
      ...user,
      password,
    });

    setFeedback('Senha atualizada. Agora você já pode entrar.', false);
    setTimeout(() => switchPanel('login'), 700);
  });

  document.querySelectorAll('[data-auth-logout="true"]').forEach((button) => {
    button.addEventListener('click', () => {
      clearUser();
      window.location.href = '/';
    });
  });

  function trackSearchAndMaybePrompt() {
    const query = String(document.body?.dataset.searchQuery || '').trim();
    const user = readUser();
    const dismissedPermanently = localStorage.getItem(PROMPT_DISMISSED_KEY) === '1';
    const dismissedUntil = Number(localStorage.getItem(PROMPT_DISMISSED_UNTIL_KEY) || '0');
    const lastShownAt = Number(localStorage.getItem(PROMPT_LAST_SHOWN_KEY) || '0');
    const showCount = Number(localStorage.getItem(PROMPT_SHOW_COUNT_KEY) || '0');
    const now = Date.now();

    if (!prompt || !query || user) {
      return;
    }

    const normalized = query.toLowerCase();
    const lastKey = 'buscaplus-last-query';
    const lastQuery = localStorage.getItem(lastKey);
    let count = Number(localStorage.getItem(SEARCH_COUNT_KEY) || '0');

    if (lastQuery !== normalized) {
      count += 1;
      localStorage.setItem(SEARCH_COUNT_KEY, String(count));
      localStorage.setItem(lastKey, normalized);
    }

    if (count < PROMPT_MIN_SEARCHES) {
      return;
    }

    if (dismissedPermanently || dismissedUntil > now) {
      return;
    }

    if (showCount >= PROMPT_MAX_SHOWS) {
      return;
    }

    if (sessionStorage.getItem(PROMPT_SESSION_SHOWN_KEY) === '1') {
      return;
    }

    if (lastShownAt && now - lastShownAt < PROMPT_COOLDOWN_MS) {
      return;
    }

    prompt.hidden = false;
    sessionStorage.setItem(PROMPT_SESSION_SHOWN_KEY, '1');
    localStorage.setItem(PROMPT_LAST_SHOWN_KEY, String(now));
    localStorage.setItem(PROMPT_SHOW_COUNT_KEY, String(showCount + 1));
  }

  document.querySelectorAll('[data-growth-dismiss="true"]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem(PROMPT_DISMISSED_UNTIL_KEY, String(Date.now() + PROMPT_COOLDOWN_MS));
      hideGrowthPrompt();
    });
  });

  document.querySelectorAll('[data-growth-action]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem(PROMPT_DISMISSED_UNTIL_KEY, String(Date.now() + PROMPT_COOLDOWN_MS));
      hideGrowthPrompt();
      openAuth(button.dataset.growthAction || 'register');
    });
  });

  document.addEventListener('buscaplus:user-updated', updateAuthUi);

  updateAuthUi();
  trackSearchAndMaybePrompt();
})();
