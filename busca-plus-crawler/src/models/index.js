const sequelize = require('../config/database');
const Source = require('../modules/sources/source.model');
const Page = require('../modules/pages/page.model');
const CrawlJob = require('../modules/jobs/crawl-job.model');
const SearchLog = require('../modules/search-logs/search-log.model');
const Sponsor = require('./sponsor.model');
const User = require('../modules/users/user.model');
const CatalogSourceFactory = require('../modules/transparency/models/catalog-source.model');
const CatalogRunFactory = require('../modules/transparency/models/catalog-run.model');
const CatalogDocumentFactory = require('../modules/transparency/models/catalog-document.model');

// Novos modelos unificados (motor modular)
const SearchableSource = require('../modules/engine/models/searchable-source.model');
const ContentItem = require('../modules/engine/models/content-item.model');
const PipelineRun = require('../modules/engine/models/pipeline-run.model');
const ContentChunk = require('../modules/ai/content-chunk.model');
const AiSearchSummary = require('../modules/ai/ai-search-summary.model');

const CatalogSource = CatalogSourceFactory(sequelize);
const CatalogRun = CatalogRunFactory(sequelize);
const CatalogDocument = CatalogDocumentFactory(sequelize);

// Associacoes legadas
Source.hasMany(Page, { foreignKey: 'source_id', as: 'pages' });
Source.hasMany(CrawlJob, { foreignKey: 'source_id', as: 'jobs' });

Page.belongsTo(Source, { foreignKey: 'source_id', as: 'source' });
Page.hasMany(SearchLog, { foreignKey: 'clicked_page_id', as: 'clicks' });

CrawlJob.belongsTo(Source, { foreignKey: 'source_id', as: 'source' });

SearchLog.belongsTo(Page, { foreignKey: 'clicked_page_id', as: 'page' });

CatalogSource.hasMany(CatalogRun, { foreignKey: 'source_id', as: 'runs' });
CatalogSource.hasMany(CatalogDocument, { foreignKey: 'source_id', as: 'documents' });

CatalogRun.belongsTo(CatalogSource, { foreignKey: 'source_id', as: 'source' });
CatalogDocument.belongsTo(CatalogSource, { foreignKey: 'source_id', as: 'source' });

// Associacoes do motor unificado
SearchableSource.hasMany(ContentItem, { foreignKey: 'source_id', as: 'contentItems' });
SearchableSource.hasMany(PipelineRun, { foreignKey: 'source_id', as: 'pipelineRuns' });
SearchableSource.hasMany(ContentChunk, { foreignKey: 'source_id', as: 'contentChunks' });

ContentItem.belongsTo(SearchableSource, { foreignKey: 'source_id', as: 'searchableSource' });
ContentItem.belongsTo(ContentItem, { foreignKey: 'parent_item_id', as: 'parentItem' });
ContentItem.hasMany(ContentItem, { foreignKey: 'parent_item_id', as: 'childItems' });
ContentItem.hasMany(ContentChunk, { foreignKey: 'content_item_id', as: 'chunks' });

ContentChunk.belongsTo(ContentItem, { foreignKey: 'content_item_id', as: 'contentItem' });
ContentChunk.belongsTo(SearchableSource, { foreignKey: 'source_id', as: 'source' });

PipelineRun.belongsTo(SearchableSource, { foreignKey: 'source_id', as: 'source' });

module.exports = {
  sequelize,
  Source,
  Page,
  CrawlJob,
  SearchLog,
  Sponsor,
  User,
  CatalogSource,
  CatalogRun,
  CatalogDocument,
  // Motor unificado
  SearchableSource,
  ContentItem,
  PipelineRun,
  ContentChunk,
  AiSearchSummary,
};
