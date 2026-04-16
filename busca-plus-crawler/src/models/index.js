const sequelize = require('../config/database');
const Source = require('../modules/sources/source.model');
const Page = require('../modules/pages/page.model');
const CrawlJob = require('../modules/jobs/crawl-job.model');
const SearchLog = require('../modules/search-logs/search-log.model');

// Define associations
Source.hasMany(Page, { foreignKey: 'source_id', as: 'pages' });
Source.hasMany(CrawlJob, { foreignKey: 'source_id', as: 'jobs' });

Page.belongsTo(Source, { foreignKey: 'source_id', as: 'source' });
Page.hasMany(SearchLog, { foreignKey: 'clicked_page_id', as: 'clicks' });

CrawlJob.belongsTo(Source, { foreignKey: 'source_id', as: 'source' });

SearchLog.belongsTo(Page, { foreignKey: 'clicked_page_id', as: 'page' });

module.exports = {
  sequelize,
  Source,
  Page,
  CrawlJob,
  SearchLog,
};
