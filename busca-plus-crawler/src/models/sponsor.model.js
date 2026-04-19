const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sponsor = sequelize.define('Sponsor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  url: { type: DataTypes.STRING(500), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  state: { type: DataTypes.STRING(2), allowNull: true, comment: 'Filtro por UF (opcional)' },
  city: { type: DataTypes.STRING(100), allowNull: true, comment: 'Filtro por cidade (opcional)' },
  start_date: { type: DataTypes.DATEONLY, allowNull: false },
  end_date: { type: DataTypes.DATEONLY, allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  click_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  images: { type: DataTypes.TEXT, allowNull: true, defaultValue: null, comment: 'JSON array de URLs de imagens (max 5)' },
}, {
  tableName: 'sponsors',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Sponsor;
