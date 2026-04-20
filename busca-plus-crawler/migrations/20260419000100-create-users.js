'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      name: { type: Sequelize.STRING(255), allowNull: false },
      email: { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash: { type: Sequelize.TEXT, allowNull: false },
      role: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'user' },
      status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'active' },
      phone: { type: Sequelize.STRING(40), allowNull: true },
      region: { type: Sequelize.STRING(255), allowNull: true },
      interests: { type: Sequelize.TEXT, allowNull: true },
      smart_search: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      future_alerts: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      photo: { type: Sequelize.TEXT, allowNull: true },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      reset_token_hash: { type: Sequelize.STRING(128), allowNull: true },
      reset_token_expires_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addIndex('users', ['email'], { unique: true, name: 'users_email_unique' });
    await queryInterface.addIndex('users', ['role'], { name: 'users_role_idx' });
    await queryInterface.addIndex('users', ['status'], { name: 'users_status_idx' });
    await queryInterface.addIndex('users', ['reset_token_hash'], { name: 'users_reset_token_hash_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
