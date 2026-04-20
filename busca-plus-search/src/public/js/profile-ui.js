(function profileUi() {
  const STORAGE_KEY = 'buscaplus-user';
  const TOKEN_KEY = 'buscaplus-auth-token';
  const card = document.querySelector('[data-profile-authenticated="true"]');
  const empty = document.querySelector('[data-profile-empty="true"]');
  const form = document.querySelector('[data-profile-form="true"]');
  const feedback = document.querySelector('[data-profile-feedback="true"]');
  const photoInput = document.querySelector('[data-profile-photo-input="true"]');
  const avatarPreview = document.querySelector('[data-profile-avatar-preview="true"]');
  let currentPhoto = '';

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

  function getAvatar(user) {
    if (user?.photo) return user.photo;
    const initials = String(user?.name || 'B')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value.charAt(0).toUpperCase())
      .join('') || 'B';

    return `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
        <rect width="96" height="96" rx="48" fill="#235cff" />
        <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="white">${initials}</text>
      </svg>
    `)}`;
  }

  function setFeedback(message, isError) {
    if (!feedback) return;
    feedback.hidden = !message;
    feedback.textContent = message || '';
    feedback.classList.toggle('is-error', Boolean(isError));
  }

  function fillProfile(user) {
    if (!card || !empty) return;
    card.hidden = !user;
    empty.hidden = Boolean(user);
    if (!user || !form) return;

    currentPhoto = user.photo || '';
    document.querySelector('[data-profile-display-name="true"]').textContent = user.name || 'Seu nome';
    document.querySelector('[data-profile-display-email="true"]').textContent = user.email || '';
    avatarPreview.src = getAvatar(user);

    const fields = form.elements;
    fields.name.value = user.name || '';
    fields.email.value = user.email || '';
    fields.phone.value = user.phone || '';
    fields.region.value = user.region || '';
    fields.interests.value = user.interests || '';
    fields.smartSearch.checked = Boolean(user.smartSearch);
    fields.futureAlerts.checked = Boolean(user.futureAlerts);
  }

  async function authRequest(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api/auth${path}`, {
      credentials: 'same-origin',
      ...options,
      headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha ao salvar perfil.');
    return data;
  }

  photoInput?.addEventListener('change', () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      currentPhoto = String(reader.result || '');
      avatarPreview.src = currentPhoto;
    };
    reader.readAsDataURL(file);
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFeedback('Salvando...', false);

    try {
      const fields = form.elements;
      const data = await authRequest('/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: fields.name.value,
          email: fields.email.value,
          phone: fields.phone.value,
          region: fields.region.value,
          interests: fields.interests.value,
          smartSearch: fields.smartSearch.checked,
          futureAlerts: fields.futureAlerts.checked,
          photo: currentPhoto,
        }),
      });
      saveUser(data.user);
      fillProfile(data.user);
      setFeedback('Perfil salvo com sucesso.', false);
    } catch (error) {
      setFeedback(error.message || 'Falha ao salvar perfil.', true);
    }
  });

  document.addEventListener('buscaplus:user-updated', (event) => fillProfile(event.detail));
  fillProfile(readUser());
})();
