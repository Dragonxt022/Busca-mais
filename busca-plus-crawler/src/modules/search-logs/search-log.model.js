const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SearchLog = sequelize.define('SearchLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  query: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  normalized_query: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  total_results: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  clicked_page_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  clicked_position: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  user_session: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  filters_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Filters applied in this search',
  },
}, {
  tableName: 'search_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['query'] },
    { fields: ['normalized_query'] },
    { fields: ['created_at'] },
    { fields: ['user_session'] },
  ],
});

module.exports = SearchLog;