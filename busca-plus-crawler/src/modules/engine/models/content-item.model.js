const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/database');

const ContentItem = sequelize.define('ContentItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'searchable_sources', key: 'id' },
  },
  parent_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'content_items', key: 'id' },
  },
  url: {
    type: DataTypes.STRING(1000),
    allowNull: false,
  },
  canonical_url: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  text_content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  markdown_content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  item_kind: {
    type: DataTypes.ENUM(
      'page',
      'news',
      'official_document',
      'pdf',
      'protocol',
      'attachment',
      'listing_item',
      'other'
    ),
    defaultValue: 'page',
    allowNull: false,
  },
  document_type: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  document_number: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  publication_date: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  department: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  file_url: {
    type: DataTypes.STRING(1000),
    allowNull: true,
  },
  file_extension: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  content_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  url_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
    unique: true,
  },
  images_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  metadata_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'indexed', 'error'),
    defaultValue: 'pending',
    allowNull: false,
  },
  has_error: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  last_crawled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_indexed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  legacy_page_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  legacy_catalog_document_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: 'content_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['url_hash'], unique: true },
    { fields: ['source_id'] },
    { fields: ['status'] },
    { fields: ['item_kind'] },
    { fields: ['publication_date'] },
    { fields: ['last_crawled_at'] },
  ],
});

module.exports = ContentItem;
