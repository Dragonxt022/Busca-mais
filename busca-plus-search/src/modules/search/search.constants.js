const SEARCH_TABS = {
  ALL: 'all',
  IMAGES: 'images',
  VIDEOS: 'videos',
  MAPS: 'maps',
  NEWS: 'news',
  MORE: 'more',
};

const RESULTS_PER_PAGE = {
  [SEARCH_TABS.ALL]: 10,
  [SEARCH_TABS.IMAGES]: 20,
};

const SEARCH_TAB_OPTIONS = [
  { key: SEARCH_TABS.ALL, label: 'Todos', icon: 'search', supported: true },
  { key: SEARCH_TABS.IMAGES, label: 'Imagens', icon: 'image', supported: true },
  { key: SEARCH_TABS.VIDEOS, label: 'Videos', icon: 'videocam', supported: false },
  { key: SEARCH_TABS.MAPS, label: 'Maps', icon: 'map', supported: false },
  { key: SEARCH_TABS.NEWS, label: 'Noticias', icon: 'article', supported: false },
  { key: SEARCH_TABS.MORE, label: 'Mais', icon: 'more_vert', supported: false },
];

module.exports = {
  RESULTS_PER_PAGE,
  SEARCH_TAB_OPTIONS,
  SEARCH_TABS,
};
