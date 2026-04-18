const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Source = sequelize.define('Source', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  base_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      isUrl: true,
    },
  },
  type: {
    type: DataTypes.ENUM('website', 'blog', 'news', 'government', 'documentation', 'other'),
    defaultValue: 'website',
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  crawl_depth: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  follow_internal_links: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  download_images: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether to download images from pages (disabled by default)',
  },
  auto_enable_images_after_pages: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    comment: 'Auto-enable download_images after this many pages are indexed (0 = disabled)',
  },
  take_screenshots: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  delay_between_requests: {
    type: DataTypes.INTEGER,
    defaultValue: 1000,
    comment: 'Delay in milliseconds between requests',
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Custom user agent string',
  },
  state: {
    type: DataTypes.STRING(2),
    allowNull: true,
    comment: 'Sigla do estado brasileiro (UF)',
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Nome do município',
  },
  schedule: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Cron expression for scheduled crawling',
  },
  last_crawled_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  config_json: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Additional configuration for this source',
  },
}, {
  tableName: 'sources',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['base_url'] },
    { fields: ['is_active'] },
    { fields: ['category'] },
  ],
});

Source.prototype.shouldDownloadImages = async function() {
  if (this.download_images) {
    return true;
  }
  
  if (this.auto_enable_images_after_pages <= 0) {
    return false;
  }
  
  const { Page } = require('../../models');
  const count = await Page.count({ where: { source_id: this.id } });
  
  if (count >= this.auto_enable_images_after_pages) {
    await this.update({ download_images: true });
    return true;
  }
  
  return false;
};

module.exports = Source;