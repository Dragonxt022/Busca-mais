'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sources');

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

    if (!table.max_pages) {
      await queryInterface.addColumn('sources', 'max_pages', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
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
