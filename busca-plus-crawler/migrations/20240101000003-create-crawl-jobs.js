'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('crawl_jobs', {
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
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed'),
        defaultValue: 'pending'
      },
      pagesFound: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        field: 'pages_found'
      },
      pagesCrawled: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        field: 'pages_crawled'
      },
      errors: {
        type: Sequelize.JSON,
        defaultValue: []
      },
      startedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'started_at'
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
        field: 'completed_at'
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
    await queryInterface.addIndex('crawl_jobs', ['source_id'], {
      name: 'crawl_jobs_source_id_idx'
    });
    await queryInterface.addIndex('crawl_jobs', ['status'], {
      name: 'crawl_jobs_status_idx'
    });
    await queryInterface.addIndex('crawl_jobs', ['created_at'], {
      name: 'crawl_jobs_created_at_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('crawl_jobs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_crawl_jobs_status"');
  }
};