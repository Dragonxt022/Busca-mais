const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const CrawlJob = sequelize.define('CrawlJob', {
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
  type: {
    type: DataTypes.ENUM('full', 'incremental', 'single_page', 'discovery'),
    defaultValue: 'single_page',
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending',
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  finished_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  pages_found: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  pages_crawled: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  pages_saved: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  pages_errored: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  payload_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Job configuration and parameters',
  },
  result_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Job results and statistics',
  },
}, {
  tableName: 'crawl_jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['source_id'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['created_at'] },
  ],
});

module.exports = CrawlJob;