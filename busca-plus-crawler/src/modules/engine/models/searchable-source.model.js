const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/database');

const SearchableSource = sequelize.define('SearchableSource', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
  },
  base_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  source_kind: {
    type: DataTypes.ENUM(
      'institutional_site',
      'transparency_portal',
      'news_site',
      'official_diary',
      'api',
      'pdf_feed',
      'other'
    ),
    defaultValue: 'institutional_site',
    allowNull: false,
  },
  crawl_strategy: {
    type: DataTypes.ENUM('web_crawl', 'listing', 'sitemap', 'api', 'manual_url'),
    defaultValue: 'web_crawl',
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING(2),
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false,
  },
  schedule: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  last_crawled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  max_items: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
  },
  config_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  legacy_source_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  legacy_catalog_source_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'searchable_sources',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['slug'], unique: true },
    { fields: ['is_active'] },
    { fields: ['source_kind'] },
    { fields: ['state', 'city'] },
  ],
});

module.exports = SearchableSource;
