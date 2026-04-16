const SearchService = require('./search.service');
const { RESULTS_PER_PAGE, SEARCH_TAB_OPTIONS, SEARCH_TABS } = require('./search.constants');
const {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPagination,
  buildSearchUrl,
  buildTabs,
} = require('./search.presenter');

module.exports = {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPagination,
  buildSearchUrl,
  buildTabs,
  RESULTS_PER_PAGE,
  SEARCH_TAB_OPTIONS,
  SEARCH_TABS,
  SearchService,
};
