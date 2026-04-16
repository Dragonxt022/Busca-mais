const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Source = sequelize.define('Source', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  base_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      isUrl: true,
    },
  },
  type: {
    type: DataTypes.ENUM('website', 'blog', 'news', 'government', 'documentation', 'other'),
    defaultValue: 'website',
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  crawl_depth: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  follow_internal_links: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  download_images: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  schedule: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Cron expression for scheduled crawling',
  },
  last_crawled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  config_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional configuration for this source',
  },
}, {
  tableName: 'sources',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['base_url'] },
    { fields: ['is_active'] },
    { fields: ['category'] },
  ],
});

module.exports = Source;