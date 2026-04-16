const sequelize = require('../../../config/database');
const CatalogSourceFactory = require('./catalog-source.model');
const CatalogRunFactory = require('./catalog-run.model');
const CatalogDocumentFactory = require('./catalog-document.model');

const CatalogSource = CatalogSourceFactory(sequelize);
const CatalogRun = CatalogRunFactory(sequelize);
const CatalogDocument = CatalogDocumentFactory(sequelize);

CatalogSource.hasMany(CatalogRun, { foreignKey: 'source_id', as: 'runs' });
CatalogSource.hasMany(CatalogDocument, { foreignKey: 'source_id', as: 'documents' });

CatalogRun.belongsTo(CatalogSource, { foreignKey: 'source_id', as: 'source' });
CatalogDocument.belongsTo(CatalogSource, { foreignKey: 'source_id', as: 'source' });

module.exports = {
  CatalogSource,
  CatalogRun,
  CatalogDocument,
};
