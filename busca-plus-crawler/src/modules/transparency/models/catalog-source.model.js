const { DataTypes } = require('sequelize');

const CatalogSource = (sequelize) => {
  return sequelize.define('CatalogSource', {
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
    source_url: {
      type: DataTypes.STRING(500),
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
    },
    auto_update_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    auto_index_after_catalog: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    schedule_type: {
      type: DataTypes.ENUM('manual', 'hourly', 'daily', 'weekly'),
      defaultValue: 'manual',
    },
    last_run_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_status: {
      type: DataTypes.ENUM('idle', 'running', 'success', 'error'),
      defaultValue: 'idle',
    },
    total_documents: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    config_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    tableName: 'catalog_sources',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['slug'], unique: true },
      { fields: ['is_active'] },
    ],
  });
};

module.exports = CatalogSource;
