'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('pages', 'images', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Extracted images with thumbnails: [{localPath, thumbnailPath, alt, width, height}]',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('pages', 'images');
  },
};