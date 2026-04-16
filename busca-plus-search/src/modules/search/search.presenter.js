const { RESULTS_PER_PAGE, SEARCH_TABS, SEARCH_TAB_OPTIONS } = require('./search.constants');

const DEFAULT_TAB = SEARCH_TABS.ALL;

const buildSearchUrl = ({ query = '', page = null, tab = null, sourceId = null } = {}) => {
  const params = new URLSearchParams();

  if (query) {
    params.set('q', query);
  }

  if (tab && tab !== DEFAULT_TAB) {
    params.set('tab', tab);
  }

  if (page && page > 1) {
    params.set('page', page);
  }

  if (sourceId) {
    params.set('source', sourceId);
  }

  const queryString = params.toString();

  return queryString ? `/?${queryString}` : '/';
};

const buildTabs = ({ query = '', sourceId = null, tab = DEFAULT_TAB }) => (
  SEARCH_TAB_OPTIONS.map((item) => ({
    ...item,
    active: item.key === tab,
    href: buildSearchUrl({
      query,
      sourceId,
      tab: item.supported ? item.key : DEFAULT_TAB,
    }),
  }))
);

const buildPagination = ({ page = 1, totalPages = 0, query = '', sourceId = null, tab = DEFAULT_TAB }) => {
  if (totalPages <= 1) {
    return null;
  }

  return {
    currentPage: page,
    totalPages,
    previousUrl: page > 1 ? buildSearchUrl({ query, page: page - 1, sourceId, tab }) : null,
    nextUrl: page < totalPages ? buildSearchUrl({ query, page: page + 1, sourceId, tab }) : null,
  };
};

const buildRelatedItems = (query, items) => items.map((item) => {
  const nextQuery = item(query);

  return {
    href: buildSearchUrl({ query: nextQuery }),
    label: nextQuery,
  };
});

const buildSidebar = (query) => ({
  peopleAlsoSearch: buildRelatedItems(query, [
    (value) => `${value} tutorial`,
    (value) => `como fazer ${value}`,
    (value) => `${value} exemplos`,
    (value) => `${value} gratis`,
  ]),
  relatedSearches: buildRelatedItems(query, [
    (value) => `${value} brasil`,
    (value) => `o que e ${value}`,
    (value) => `${value} online`,
    (value) => `${value} download`,
  ]),
});

const buildImageCards = (results) => (
  results.flatMap((result) => (
    (result.images || []).slice(0, 6).map((image) => ({
      alt: image.alt || result.title,
      domain: result.domain,
      thumbnailPath: image.thumbnailPath,
      title: image.alt || result.title,
      url: result.url,
    }))
  ))
);

const buildEmptyIndexViewModel = ({ tab = DEFAULT_TAB } = {}) => ({
  hasQuery: false,
  imageCards: [],
  imageResults: null,
  page: 1,
  pagination: null,
  query: '',
  results: null,
  sidebar: null,
  source: null,
  statsLabel: null,
  tab,
  tabs: buildTabs({ tab }),
  totalHits: 0,
  totalPages: 0,
});

const buildIndexViewModel = ({
  page = 1,
  query = '',
  results = null,
  sourceId = null,
  tab = DEFAULT_TAB,
} = {}) => {
  if (!results) {
    return buildEmptyIndexViewModel({ tab });
  }

  const normalizedTab = RESULTS_PER_PAGE[tab] ? tab : DEFAULT_TAB;
  const isImageTab = normalizedTab === SEARCH_TABS.IMAGES;
  const totalPages = Math.ceil(results.found / RESULTS_PER_PAGE[normalizedTab]);

  return {
    hasQuery: Boolean(query),
    imageCards: isImageTab ? buildImageCards(results.hits) : [],
    imageResults: isImageTab ? results.hits : null,
    page,
    pagination: buildPagination({
      page,
      query,
      sourceId,
      tab: normalizedTab,
      totalPages,
    }),
    query,
    results: isImageTab ? null : results.hits,
    sidebar: isImageTab ? null : buildSidebar(query),
    source: sourceId,
    statsLabel: isImageTab
      ? `${results.found} imagens para "${query}"`
      : `${results.found} resultados para "${query}"`,
    tab: normalizedTab,
    tabs: buildTabs({ query, sourceId, tab: normalizedTab }),
    totalHits: results.found,
    totalPages,
  };
};

module.exports = {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPagination,
  buildSearchUrl,
  buildTabs,
};
