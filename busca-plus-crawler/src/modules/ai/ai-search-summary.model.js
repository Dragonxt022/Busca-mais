const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const AiSearchSummary = sequelize.define('AiSearchSummary', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  query_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  query: { type: DataTypes.TEXT, allowNull: false },
  filters_json: { type: DataTypes.JSON, allowNull: true },
  result_signature: { type: DataTypes.STRING(64), allowNull: true },
  summary_text: { type: DataTypes.TEXT, allowNull: false },
  sources_json: { type: DataTypes.JSON, allowNull: true },
  provider: { type: DataTypes.STRING(50), allowNull: true },
  model: { type: DataTypes.STRING(120), allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'ai_search_summaries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['query_hash'], unique: true },
    { fields: ['expires_at'] },
  ],
});

module.exports = AiSearchSummary;
