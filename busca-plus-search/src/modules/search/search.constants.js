const SEARCH_TABS = {
  ALL: 'all',
  IMAGES: 'images',
};

const RESULTS_PER_PAGE = {
  [SEARCH_TABS.ALL]: 10,
  [SEARCH_TABS.IMAGES]: 20,
};

const SEARCH_TAB_OPTIONS = [
  { key: SEARCH_TABS.ALL, label: 'Todos', icon: 'search', supported: true },
  { key: SEARCH_TABS.IMAGES, label: 'Imagens', icon: 'image', supported: true },
];

module.exports = {
  RESULTS_PER_PAGE,
  SEARCH_TAB_OPTIONS,
  SEARCH_TABS,
};
