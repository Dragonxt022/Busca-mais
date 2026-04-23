'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('searchable_sources', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      base_url: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      source_kind: {
        type: Sequelize.ENUM(
          'institutional_site',
          'transparency_portal',
          'news_site',
          'official_diary',
          'api',
          'pdf_feed',
          'other'
        ),
        defaultValue: 'institutional_site',
        allowNull: false,
      },
      crawl_strategy: {
        type: Sequelize.ENUM('web_crawl', 'listing', 'sitemap', 'api', 'manual_url'),
        defaultValue: 'web_crawl',
        allowNull: false,
      },
      state: {
        type: Sequelize.STRING(2),
        allowNull: true,
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      schedule: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Cron expression for scheduled crawling',
      },
      last_crawled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      max_items: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'Limite maximo de itens por execucao (null = sem limite)',
      },
      config_json: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Configuracao especifica do adaptador e crawl',
      },
      legacy_source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID na tabela sources legada (para migracao)',
      },
      legacy_catalog_source_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID na tabela catalog_sources legada (para migracao)',
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

    await queryInterface.addIndex('searchable_sources', ['slug'], {
      name: 'searchable_sources_slug_unique',
      unique: true,
    });
    await queryInterface.addIndex('searchable_sources', ['is_active'], {
      name: 'searchable_sources_is_active_idx',
    });
    await queryInterface.addIndex('searchable_sources', ['source_kind'], {
      name: 'searchable_sources_source_kind_idx',
    });
    await queryInterface.addIndex('searchable_sources', ['state', 'city'], {
      name: 'searchable_sources_location_idx',
    });
    await queryInterface.addIndex('searchable_sources', ['legacy_source_id'], {
      name: 'searchable_sources_legacy_source_idx',
    });
    await queryInterface.addIndex('searchable_sources', ['legacy_catalog_source_id'], {
      name: 'searchable_sources_legacy_catalog_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('searchable_sources');
  },
};
