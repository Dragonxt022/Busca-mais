const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Page = sequelize.define('Page', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'sources',
      key: 'id',
    },
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  canonical_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  slug: {
    type: DataTypes.STRING(500),
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
  content_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  content_html: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  screenshot_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  favicon_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  language: {
    type: DataTypes.STRING(10),
    allowNull: true,
  },
  status_code: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  hash_url: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  hash_content: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  response_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  word_count: {
    type: DataTypes.INTEGER,
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
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  has_error: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional metadata: author, published_date, keywords, etc.',
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Extracted images with thumbnails: [{localPath, thumbnailPath, alt, width, height}]',
  },
}, {
  tableName: 'pages',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['url'] },
    { fields: ['hash_url'], unique: true },
    { fields: ['source_id'] },
    { fields: ['is_active'] },
    { fields: ['last_crawled_at'] },
  ],
});

module.exports = Page;