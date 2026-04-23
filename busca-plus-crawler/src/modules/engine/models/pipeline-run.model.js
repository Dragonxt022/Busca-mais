const { DataTypes } = require('sequelize');
const sequelize = require('../../../config/database');

const PipelineRun = sequelize.define('PipelineRun', {
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
  run_type: {
    type: DataTypes.ENUM('full', 'incremental', 'single_item', 'discovery'),
    defaultValue: 'full',
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false,
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  finished_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  items_found: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  items_created: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  items_updated: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  items_indexed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  items_errored: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  metadata_json: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'pipeline_runs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['source_id'] },
    { fields: ['status'] },
    { fields: ['started_at'] },
  ],
});

module.exports = PipelineRun;
