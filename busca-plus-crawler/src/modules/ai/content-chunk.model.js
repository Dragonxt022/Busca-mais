const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ContentChunk = sequelize.define('ContentChunk', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  content_item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'content_items', key: 'id' },
    onDelete: 'CASCADE',
  },
  source_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'searchable_sources', key: 'id' },
    onDelete: 'SET NULL',
  },
  chunk_index: { type: DataTypes.INTEGER, allowNull: false },
  text: { type: DataTypes.TEXT, allowNull: false },
  text_hash: { type: DataTypes.STRING(64), allowNull: false },
  token_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  embedding_provider: { type: DataTypes.STRING(50), allowNull: true },
  embedding_model: { type: DataTypes.STRING(120), allowNull: true },
  embedding_json: { type: DataTypes.JSON, allowNull: true },
  embedded_at: { type: DataTypes.DATE, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'embedded', 'error', 'skipped'),
    allowNull: false,
    defaultValue: 'pending',
  },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  metadata_json: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'content_chunks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['content_item_id', 'chunk_index'], unique: true },
    { fields: ['source_id'] },
    { fields: ['status'] },
    { fields: ['text_hash'] },
  ],
});

module.exports = ContentChunk;
