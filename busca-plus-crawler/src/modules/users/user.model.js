const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password_hash: { type: DataTypes.TEXT, allowNull: false },
  role: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'user',
    validate: { isIn: [['user', 'admin']] },
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'active',
    validate: { isIn: [['active', 'inactive']] },
  },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  region: { type: DataTypes.STRING(255), allowNull: true },
  interests: { type: DataTypes.TEXT, allowNull: true },
  smart_search: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  future_alerts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  photo: { type: DataTypes.TEXT, allowNull: true },
  last_login_at: { type: DataTypes.DATE, allowNull: true },
  reset_token_hash: { type: DataTypes.STRING(128), allowNull: true },
  reset_token_expires_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['email'] },
    { fields: ['role'] },
    { fields: ['status'] },
    { fields: ['reset_token_hash'] },
  ],
});

module.exports = User;
