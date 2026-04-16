const { DataTypes } = require('sequelize');

const CatalogDocument = (sequelize) => {
  return sequelize.define('CatalogDocument', {
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
    external_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    source_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    extension: {
      type: DataTypes.STRING(20),
      defaultValue: 'PDF',
    },
    tipo: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    numero_ano: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    data_documento: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    data_publicacao: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ementa: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    detalhe_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    download_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    pagina_origem: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    row_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'indexed', 'error'),
      defaultValue: 'pending',
    },
    metadata_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  }, {
    tableName: 'catalog_documents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['source_id', 'external_id'], unique: true },
      { fields: ['status'] },
      { fields: ['data_publicacao'] },
    ],
  });
};

module.exports = CatalogDocument;
