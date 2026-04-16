'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pages', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      sourceId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sources',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        field: 'source_id'
      },
      url: {
        type: Sequelize.STRING(1000),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      keywords: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      screenshotPath: {
        type: Sequelize.STRING(500),
        allowNull: true,
        field: 'screenshot_path'
      },
      crawledAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'crawled_at'
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
    await queryInterface.addIndex('pages', ['url'], {
      name: 'pages_url_idx',
      unique: true
    });
    await queryInterface.addIndex('pages', ['source_id'], {
      name: 'pages_source_id_idx'
    });
    await queryInterface.addIndex('pages', ['crawled_at'], {
      name: 'pages_crawled_at_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('pages');
  }
};