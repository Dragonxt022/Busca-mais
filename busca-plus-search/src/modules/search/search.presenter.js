const { RESULTS_PER_PAGE, SEARCH_TABS, SEARCH_TAB_OPTIONS } = require('./search.constants');

const DEFAULT_TAB = SEARCH_TABS.ALL;
const MAX_SIDEBAR_ITEMS = 4;
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'por', 'com', 'sem', 'na', 'no',
  'nas', 'nos', 'o', 'a', 'os', 'as', 'um', 'uma', 'ou', 'lei', 'leis', 'documento',
  'documentos', 'pagina', 'paginas', 'cujubim',
]);

const buildSearchUrl = ({ query = '', page = null, tab = null, sourceId = null, state = null, city = null } = {}) => {
  const params = new URLSearchParams();

  if (query) params.set('q', query);
  if (tab && tab !== DEFAULT_TAB) params.set('tab', tab);
  if (page && page > 1) params.set('page', page);
  if (sourceId) params.set('source', sourceId);
  if (state) params.set('state', state);
  if (city) params.set('city', city);

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : '/';
};

const buildTabs = ({ query = '', sourceId = null, tab = DEFAULT_TAB, state = null, city = null }) => (
  SEARCH_TAB_OPTIONS.map((item) => ({
    ...item,
    active: item.key === tab,
    href: buildSearchUrl({
      query,
      sourceId,
      tab: item.supported ? item.key : DEFAULT_TAB,
      state,
      city,
    }),
  }))
);

const buildPagination = ({ page = 1, totalPages = 0, query = '', sourceId = null, tab = DEFAULT_TAB, state = null, city = null }) => {
  if (totalPages <= 1) {
    return null;
  }

  return {
    currentPage: page,
    totalPages,
    previousUrl: page > 1 ? buildSearchUrl({ query, page: page - 1, sourceId, tab, state, city }) : null,
    nextUrl: page < totalPages ? buildSearchUrl({ query, page: page + 1, sourceId, tab, state, city }) : null,
  };
};

const buildRelatedItems = (query, items) => items.map((item) => {
  const nextQuery = item(query);

  return {
    href: buildSearchUrl({ query: nextQuery }),
    label: nextQuery,
  };
});

const uniqueBy = (items, keySelector) => {
  const seen = new Set();

  return items.filter((item) => {
    const key = keySelector(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const truncateText = (value, maxLength = 180) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
};

const getSnippet = (result) => {
  return truncateText(
    result.matchSnippetText
      || result.description
      || result.content
      || result.title,
    220,
  );
};

const buildTopSources = ({ query, results = [], sourceId = null }) => {
  const grouped = new Map();

  results.forEach((result) => {
    const label = String(result.sourceName || result.domain || 'Origem desconhecida').trim();
    const key = String(result.sourceId || label).trim();

    if (!key) {
      return;
    }

    const current = grouped.get(key) || {
      key,
      label,
      href: buildSearchUrl({ query, sourceId: result.sourceId, tab: DEFAULT_TAB }),
      count: 0,
    };

    current.count += 1;
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_SIDEBAR_ITEMS)
    .map((item) => ({
      ...item,
      active: Boolean(sourceId) && String(sourceId) === String(item.key),
    }));
};

const buildDocumentHighlights = ({ query, results = [] }) => {
  const catalogResults = results.filter((result) => result.recordType === 'catalog_document');
  const grouped = new Map();

  catalogResults.forEach((result) => {
    const label = String(result.documentType || result.fileExtension || 'Documento').trim();

    if (!label) {
      return;
    }

    const current = grouped.get(label) || {
      label,
      count: 0,
      href: buildSearchUrl({ query: `${query} ${label}`.trim() }),
    };

    current.count += 1;
    grouped.set(label, current);
  });

  return Array.from(grouped.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_SIDEBAR_ITEMS);
};

const buildQueryIdeas = ({ query, results = [] }) => {
  const ideas = [];
  const queryTokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  results.forEach((result) => {
    [
      result.documentType,
      result.fileExtension,
      result.sourceName,
      result.title,
    ].forEach((value) => {
      String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9à-ÿ]+/i)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token) && !queryTokens.includes(token))
        .forEach((token) => {
          ideas.push({
            label: `${query} ${token}`.trim(),
            href: buildSearchUrl({ query: `${query} ${token}`.trim() }),
          });
        });
    });
  });

  return uniqueBy(ideas, (item) => item.label.toLowerCase()).slice(0, MAX_SIDEBAR_ITEMS);
};

const buildFeaturedResult = (results = []) => {
  const featured = results[0];

  if (!featured) {
    return null;
  }

  return {
    title: featured.title,
    sourceName: featured.sourceName || featured.domain || 'Origem desconhecida',
    snippet: getSnippet(featured),
    detailUrl: featured.detailUrl || featured.url,
    openUrl: featured.openUrl || featured.url,
    isCatalogDocument: featured.recordType === 'catalog_document',
    query: featured.query || '',
  };
};

const buildSidebar = ({ query, results, totalHits, sourceId = null }) => {
  const normalizedResults = Array.isArray(results) ? results : [];
  const catalogCount = normalizedResults.filter((result) => result.recordType === 'catalog_document').length;
  const pageCount = normalizedResults.length - catalogCount;
  const topSources = buildTopSources({ query, results: normalizedResults, sourceId });

  return {
    summary: {
      totalHits,
      sourceCount: new Set(normalizedResults.map((result) => result.sourceName || result.domain).filter(Boolean)).size,
      catalogCount,
      pageCount,
    },
    featuredResult: buildFeaturedResult(normalizedResults),
    topSources,
    documentHighlights: buildDocumentHighlights({ query, results: normalizedResults }),
    queryIdeas: buildQueryIdeas({ query, results: normalizedResults }),
  };
};

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
  state = null,
  city = null,
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
      state,
      city,
    }),
    query,
    results: isImageTab ? null : results.hits,
    sidebar: isImageTab ? null : buildSidebar({
      query,
      results: results.hits,
      totalHits: results.found,
      sourceId,
    }),
    source: sourceId,
    statsLabel: isImageTab
      ? `${results.found} imagens para "${query}"`
      : `${results.found} resultados para "${query}"`,
    tab: normalizedTab,
    tabs: buildTabs({ query, sourceId, tab: normalizedTab, state, city }),
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
