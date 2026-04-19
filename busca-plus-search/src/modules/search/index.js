const SearchService = require('./search.service');
const { RESULTS_PER_PAGE, SEARCH_TAB_OPTIONS, SEARCH_TABS } = require('./search.constants');
const {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPagination,
  buildSearchUrl,
  buildTabs,
} = require('./search.presenter');
const { buildSponsoredExperience } = require('./sponsor.presenter');
const {
  buildPageViewModel,
  formatContentHtml,
} = require('./page.presenter');

module.exports = {
  buildEmptyIndexViewModel,
  buildIndexViewModel,
  buildPageViewModel,
  buildPagination,
  buildSearchUrl,
  buildSponsoredExperience,
  buildTabs,
  formatContentHtml,
  RESULTS_PER_PAGE,
  SEARCH_TAB_OPTIONS,
  SEARCH_TABS,
  SearchService,
};
