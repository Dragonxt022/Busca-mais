'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sources');

    if (!table.type) {
      await queryInterface.addColumn('sources', 'type', {
        type: Sequelize.ENUM('website', 'blog', 'news', 'government', 'documentation', 'other'),
        allowNull: false,
        defaultValue: 'website',
      });
    }

    if (!table.category) {
      await queryInterface.addColumn('sources', 'category', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!table.crawl_depth) {
      await queryInterface.addColumn('sources', 'crawl_depth', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
      });
    }

    if (!table.follow_internal_links) {
      await queryInterface.addColumn('sources', 'follow_internal_links', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      });
    }

    if (!table.download_images) {
      await queryInterface.addColumn('sources', 'download_images', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      });
    }

    if (!table.auto_enable_images_after_pages) {
      await queryInterface.addColumn('sources', 'auto_enable_images_after_pages', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      });
    } else {
      await queryInterface.changeColumn('sources', 'auto_enable_images_after_pages', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0,
      });
    }

    if (!table.take_screenshots) {
      await queryInterface.addColumn('sources', 'take_screenshots', {
        type: Sequelize.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      });
    }

    if (!table.delay_between_requests) {
      await queryInterface.addColumn('sources', 'delay_between_requests', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1000,
      });
    }

    if (!table.user_agent) {
      await queryInterface.addColumn('sources', 'user_agent', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }

    if (!table.state) {
      await queryInterface.addColumn('sources', 'state', {
        type: Sequelize.STRING(2),
        allowNull: true,
      });
    }

    if (!table.city) {
      await queryInterface.addColumn('sources', 'city', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!table.schedule) {
      await queryInterface.addColumn('sources', 'schedule', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!table.max_pages) {
      await queryInterface.addColumn('sources', 'max_pages', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!table.config_json) {
      await queryInterface.addColumn('sources', 'config_json', {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE sources
      SET auto_enable_images_after_pages = 0
      WHERE download_images = false OR download_images IS NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sources');

    if (table.auto_enable_images_after_pages) {
      await queryInterface.changeColumn('sources', 'auto_enable_images_after_pages', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 10,
      });
    }

    if (table.max_pages) {
      await queryInterface.removeColumn('sources', 'max_pages');
    }
  },
};
