'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('search_logs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      query: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      resultsCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        field: 'results_count'
      },
      source: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        field: 'created_at'
      }
    });

    // Add indexes
    await queryInterface.addIndex('search_logs', ['query'], {
      name: 'search_logs_query_idx'
    });
    await queryInterface.addIndex('search_logs', ['created_at'], {
      name: 'search_logs_created_at_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('search_logs');
  }
};