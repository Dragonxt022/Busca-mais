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
