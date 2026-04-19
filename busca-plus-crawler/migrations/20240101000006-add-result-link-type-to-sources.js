'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('sources');
    if (!tableDesc.result_link_type) {
      await queryInterface.addColumn('sources', 'result_link_type', {
        type: Sequelize.ENUM('detail_page', 'direct_document'),
        defaultValue: 'detail_page',
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sources', 'result_link_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_sources_result_link_type";');
  },
};
