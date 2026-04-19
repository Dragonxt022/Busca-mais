(function () {
  var STORAGE_STATE = 'busca_state';
  var STORAGE_CITY = 'busca_city';
  var STORAGE_SET = 'busca_location_set';

  function getLocation() {
    return {
      state: localStorage.getItem(STORAGE_STATE) || '',
      city: localStorage.getItem(STORAGE_CITY) || '',
    };
  }

  function setLocation(state, city) {
    localStorage.setItem(STORAGE_STATE, state);
    localStorage.setItem(STORAGE_CITY, city);
    localStorage.setItem(STORAGE_SET, '1');
  }

  function isLocationSet() {
    return localStorage.getItem(STORAGE_SET) === '1';
  }

  function updateLogo() {
    var city = localStorage.getItem(STORAGE_CITY);
    if (!city) return;
    document.querySelectorAll('.logo span, .logo-large span, .page-logo span').forEach(function (el) {
      el.textContent = '+' + city;
    });
    document.querySelectorAll('.logo, .logo-large, .page-logo').forEach(function (el) {
      el.setAttribute('title', 'Busca+' + city);
    });
  }

  function injectLocationParams(form) {
    var loc = getLocation();
    if (!loc.state && !loc.city) return;

    var addHidden = function (name, value) {
      if (!form.querySelector('input[name="' + name + '"]')) {
        var inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = name;
        inp.value = value;
        form.appendChild(inp);
      }
    };

    if (loc.state) addHidden('state', loc.state);
    if (loc.city) addHidden('city', loc.city);
  }

  function showModal() {
    var modal = document.getElementById('locationModal');
    if (!modal) return;
    modal.removeAttribute('hidden');
    var loc = getLocation();
    var stateSelect = document.getElementById('locationState');
    var skipBtn = document.getElementById('locationSkip');
    if (loc.state && stateSelect && stateSelect.value !== loc.state) {
      stateSelect.value = loc.state;
      loadCities(loc.state, loc.city);
    }
    if (skipBtn) {
      skipBtn.textContent = isLocationSet() ? 'Cancelar' : 'Pular por enquanto';
    }
  }

  function hideModal() {
    var modal = document.getElementById('locationModal');
    if (modal) modal.setAttribute('hidden', '');
  }

  window.openLocationModal = showModal;

  function loadCities(state, preselect) {
    var cityInput = document.getElementById('locationCity');
    if (!cityInput) return;

    cityInput.innerHTML = '<option value="">Carregando cidades...</option>';
    cityInput.disabled = true;

    if (!state) {
      cityInput.innerHTML = '<option value="">Selecione um estado primeiro</option>';
      return;
    }

    var selectedCity = preselect || cityInput.getAttribute('data-selected-city') || '';

    fetch('/api/cities?state=' + encodeURIComponent(state))
      .then(function (r) { return r.json(); })
      .then(function (cities) {
        var items = Array.isArray(cities) ? cities : [];
        cityInput.innerHTML = '<option value="">Selecione...</option>';
        items.forEach(function (city) {
          var option = document.createElement('option');
          option.value = city;
          option.textContent = city;
          if (selectedCity && city === selectedCity) option.selected = true;
          cityInput.appendChild(option);
        });
        if (items.length === 0) {
          cityInput.innerHTML = '<option value="">Nenhuma cidade encontrada</option>';
        }
        cityInput.disabled = false;
      })
      .catch(function () {
        cityInput.innerHTML = '<option value="">Nao foi possivel carregar as cidades</option>';
      });
  }

  function bindModal() {
    var modal = document.getElementById('locationModal');
    if (!modal) return;

    var form = document.getElementById('locationForm');
    var skipBtn = document.getElementById('locationSkip');

    var stateSelect = document.getElementById('locationState');
    var citySelect = document.getElementById('locationCity');
    if (stateSelect) {
      stateSelect.addEventListener('change', function () {
        loadCities(stateSelect.value);
      });
    }

    if (stateSelect && citySelect) {
      var currentState = stateSelect.value;
      var currentCity = citySelect.getAttribute('data-selected-city') || '';
      if (currentState) {
        loadCities(currentState);
        if (currentCity) {
          citySelect.value = currentCity;
        }
      }
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var state = document.getElementById('locationState').value.trim();
        var city = document.getElementById('locationCity').value.trim();
        if (!state || !city) return;
        setLocation(state, city);
        hideModal();
        updateLogo();
        // inject into all search forms and submit the pending one
        document.querySelectorAll('form[action="/"], form.search-header').forEach(injectLocationParams);
        if (window._locationPendingForm) {
          window._locationPendingForm.submit();
          window._locationPendingForm = null;
        }
      });
    }

    if (skipBtn) {
      skipBtn.addEventListener('click', function () {
        localStorage.setItem(STORAGE_SET, '1');
        hideModal();
        if (window._locationPendingForm) {
          window._locationPendingForm.submit();
          window._locationPendingForm = null;
        }
      });
    }

    modal.addEventListener('click', function (e) {
      if (e.target === modal && isLocationSet()) {
        hideModal();
      }
    });
  }

  function interceptSearchForms() {
    document.querySelectorAll('form[action="/"], form.search-header').forEach(function (form) {
      if (isLocationSet()) {
        injectLocationParams(form);
        return;
      }

      form.addEventListener('submit', function (e) {
        var q = form.querySelector('input[name="q"]');
        if (!q || !q.value.trim()) return;

        if (!isLocationSet()) {
          e.preventDefault();
          window._locationPendingForm = form;
          showModal();
        }
      }, { capture: true });
    });
  }

  function bindNavButtons() {
    document.querySelectorAll('.js-open-location').forEach(function (btn) {
      btn.addEventListener('click', showModal);
    });
  }

  function init() {
    updateLogo();
    bindModal();
    interceptSearchForms();
    bindNavButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
