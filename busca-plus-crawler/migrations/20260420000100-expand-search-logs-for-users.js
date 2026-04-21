'use strict';

async function describeTable(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return {};
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await describeTable(queryInterface, 'search_logs');

    if (!table.normalized_query) {
      await queryInterface.addColumn('search_logs', 'normalized_query', {
        type: Sequelize.STRING(500),
        allowNull: true,
      });
    }

    if (!table.total_results) {
      await queryInterface.addColumn('search_logs', 'total_results', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!table.clicked_page_id) {
      await queryInterface.addColumn('search_logs', 'clicked_page_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.clicked_position) {
      await queryInterface.addColumn('search_logs', 'clicked_position', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    if (!table.user_session) {
      await queryInterface.addColumn('search_logs', 'user_session', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!table.filters_json) {
      await queryInterface.addColumn('search_logs', 'filters_json', {
        type: Sequelize.JSON,
        allowNull: true,
      });
    }

    await queryInterface.addIndex('search_logs', ['normalized_query'], { name: 'search_logs_normalized_query_idx' }).catch(() => {});
    await queryInterface.addIndex('search_logs', ['user_session'], { name: 'search_logs_user_session_idx' }).catch(() => {});
  },

  async down(queryInterface) {
    const table = await describeTable(queryInterface, 'search_logs');

    if (table.filters_json) await queryInterface.removeColumn('search_logs', 'filters_json');
    if (table.user_session) await queryInterface.removeColumn('search_logs', 'user_session');
    if (table.clicked_position) await queryInterface.removeColumn('search_logs', 'clicked_position');
    if (table.clicked_page_id) await queryInterface.removeColumn('search_logs', 'clicked_page_id');
    if (table.total_results) await queryInterface.removeColumn('search_logs', 'total_results');
    if (table.normalized_query) await queryInterface.removeColumn('search_logs', 'normalized_query');
  },
};
