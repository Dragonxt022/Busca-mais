'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('content_items', {
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
      parent_item_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'content_items',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Item pai (ex: pagina de listagem que originou este documento)',
      },
      url: {
        type: Sequelize.STRING(1000),
        allowNull: false,
      },
      canonical_url: {
        type: Sequelize.STRING(1000),
        allowNull: true,
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      text_content: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Texto limpo extraido do conteudo',
      },
      markdown_content: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      item_kind: {
        type: Sequelize.ENUM(
          'page',
          'news',
          'official_document',
          'pdf',
          'protocol',
          'attachment',
          'listing_item',
          'other'
        ),
        defaultValue: 'page',
        allowNull: false,
      },
      document_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Tipo do documento oficial (Lei, Decreto, Portaria, etc)',
      },
      document_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      publication_date: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      department: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Orgao/secretaria/setor responsavel',
      },
      file_url: {
        type: Sequelize.STRING(1000),
        allowNull: true,
        comment: 'URL do arquivo para download (PDF, DOCX, etc)',
      },
      file_extension: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      content_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: 'Hash SHA256 do conteudo para deduplicacao',
      },
      url_hash: {
        type: Sequelize.STRING(64),
        allowNull: true,
        unique: true,
        comment: 'Hash da URL canonica para lookup rapido',
      },
      images_json: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array de imagens encontradas',
      },
      metadata_json: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Metadados extras (OG tags, schema.org, etc)',
      },
      status: {
        type: Sequelize.ENUM('pending', 'indexed', 'error'),
        defaultValue: 'pending',
        allowNull: false,
      },
      has_error: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      last_crawled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_indexed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      legacy_page_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID na tabela pages legada (para migracao)',
      },
      legacy_catalog_document_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID na tabela catalog_documents legada (para migracao)',
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

    await queryInterface.addIndex('content_items', ['url_hash'], {
      name: 'content_items_url_hash_unique',
      unique: true,
    });
    await queryInterface.addIndex('content_items', ['source_id'], {
      name: 'content_items_source_id_idx',
    });
    await queryInterface.addIndex('content_items', ['status'], {
      name: 'content_items_status_idx',
    });
    await queryInterface.addIndex('content_items', ['item_kind'], {
      name: 'content_items_item_kind_idx',
    });
    await queryInterface.addIndex('content_items', ['publication_date'], {
      name: 'content_items_publication_date_idx',
    });
    await queryInterface.addIndex('content_items', ['last_crawled_at'], {
      name: 'content_items_last_crawled_at_idx',
    });
    await queryInterface.addIndex('content_items', ['legacy_page_id'], {
      name: 'content_items_legacy_page_idx',
    });
    await queryInterface.addIndex('content_items', ['legacy_catalog_document_id'], {
      name: 'content_items_legacy_catalog_doc_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('content_items');
  },
};
