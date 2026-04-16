const { DataTypes } = require('sequelize');

const CatalogRun = (sequelize) => {
  return sequelize.define('CatalogRun', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    source_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'catalog_sources',
        key: 'id',
      },
    },
    type: {
      type: DataTypes.ENUM('create', 'update'),
      defaultValue: 'update',
    },
    status: {
      type: DataTypes.ENUM('running', 'success', 'error', 'cancelled'),
      defaultValue: 'running',
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    finished_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    new_items: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    updated_items: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    failed_items: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    tableName: 'catalog_runs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['source_id'] },
      { fields: ['status'] },
      { fields: ['started_at'] },
    ],
  });
};

module.exports = CatalogRun;
