'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('content_chunks', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      content_item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'content_items', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'searchable_sources', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      chunk_index: { type: Sequelize.INTEGER, allowNull: false },
      text: { type: Sequelize.TEXT, allowNull: false },
      text_hash: { type: Sequelize.STRING(64), allowNull: false },
      token_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      embedding_provider: { type: Sequelize.STRING(50), allowNull: true },
      embedding_model: { type: Sequelize.STRING(120), allowNull: true },
      embedding_json: { type: Sequelize.JSON, allowNull: true },
      embedded_at: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.ENUM('pending', 'embedded', 'error', 'skipped'), allowNull: false, defaultValue: 'pending' },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      metadata_json: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('content_chunks', ['content_item_id', 'chunk_index'], { unique: true });
    await queryInterface.addIndex('content_chunks', ['source_id']);
    await queryInterface.addIndex('content_chunks', ['status']);
    await queryInterface.addIndex('content_chunks', ['text_hash']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('content_chunks');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_content_chunks_status";');
  },
};
