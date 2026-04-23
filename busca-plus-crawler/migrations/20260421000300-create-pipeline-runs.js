'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('pipeline_runs', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      source_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'searchable_sources',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      run_type: {
        type: Sequelize.ENUM('full', 'incremental', 'single_item', 'discovery'),
        defaultValue: 'full',
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'),
        defaultValue: 'pending',
        allowNull: false,
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      items_found: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      items_created: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      items_updated: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      items_indexed: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      items_errored: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata_json: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('pipeline_runs', ['source_id'], {
      name: 'pipeline_runs_source_id_idx',
    });
    await queryInterface.addIndex('pipeline_runs', ['status'], {
      name: 'pipeline_runs_status_idx',
    });
    await queryInterface.addIndex('pipeline_runs', ['started_at'], {
      name: 'pipeline_runs_started_at_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('pipeline_runs');
  },
};
