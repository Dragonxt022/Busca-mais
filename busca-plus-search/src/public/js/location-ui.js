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
    if (modal) modal.removeAttribute('hidden');
  }

  function hideModal() {
    var modal = document.getElementById('locationModal');
    if (modal) modal.setAttribute('hidden', '');
  }

  function loadCities(state) {
    var cityInput = document.getElementById('locationCity');
    if (!cityInput || !state) return;
    fetch('/api/cities?state=' + encodeURIComponent(state))
      .then(function (r) { return r.json(); })
      .then(function (cities) {
        if (!cities || cities.length === 0) return;
        var datalist = document.getElementById('locationCityList');
        if (!datalist) {
          datalist = document.createElement('datalist');
          datalist.id = 'locationCityList';
          cityInput.setAttribute('list', 'locationCityList');
          cityInput.parentNode.appendChild(datalist);
        }
        datalist.innerHTML = cities.map(function (c) { return '<option value="' + c + '">'; }).join('');
      })
      .catch(function () {});
  }

  function bindModal() {
    var modal = document.getElementById('locationModal');
    if (!modal) return;

    var form = document.getElementById('locationForm');
    var skipBtn = document.getElementById('locationSkip');

    var stateSelect = document.getElementById('locationState');
    if (stateSelect) {
      stateSelect.addEventListener('change', function () {
        loadCities(stateSelect.value);
      });
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

  function init() {
    updateLogo();
    bindModal();
    interceptSearchForms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
