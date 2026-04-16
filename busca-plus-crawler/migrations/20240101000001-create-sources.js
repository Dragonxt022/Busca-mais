'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sources', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      baseUrl: {
        type: Sequelize.STRING(500),
        allowNull: false,
        field: 'base_url'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        field: 'is_active'
      },
      crawlConfig: {
        type: Sequelize.JSON,
        defaultValue: {},
        field: 'crawl_config'
      },
      lastCrawledAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'last_crawled_at'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        field: 'created_at'
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        field: 'updated_at'
      }
    });

    // Add indexes
    await queryInterface.addIndex('sources', ['base_url'], {
      name: 'sources_base_url_idx',
      unique: true
    });
    await queryInterface.addIndex('sources', ['is_active'], {
      name: 'sources_is_active_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sources');
  }
};