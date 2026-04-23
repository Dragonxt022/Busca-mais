'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_search_summaries', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      query_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      query: { type: Sequelize.TEXT, allowNull: false },
      filters_json: { type: Sequelize.JSON, allowNull: true },
      result_signature: { type: Sequelize.STRING(64), allowNull: true },
      summary_text: { type: Sequelize.TEXT, allowNull: false },
      sources_json: { type: Sequelize.JSON, allowNull: true },
      provider: { type: Sequelize.STRING(50), allowNull: true },
      model: { type: Sequelize.STRING(120), allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('ai_search_summaries', ['query_hash'], { unique: true });
    await queryInterface.addIndex('ai_search_summaries', ['expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_search_summaries');
  },
};
