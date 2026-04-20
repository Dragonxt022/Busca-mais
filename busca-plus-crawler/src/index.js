// Load environment variables first
require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');
const { logger } = require('./libs/logger');
const config = require('./config');
const { ensurePlaywrightChromium } = require('./libs/playwright-utils');
const { ensureDefaultAdmin } = require('./services/bootstrap-admin.service');

const PORT = config.server.port;
const DB_RETRY_ATTEMPTS = 12;
const DB_RETRY_DELAY_MS = 5000;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectDatabaseWithRetry() {
  let lastError = null;

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await sequelize.authenticate();
      logger.info(`Database connection established on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`Database connection attempt ${attempt}/${DB_RETRY_ATTEMPTS} failed: ${error.message}`);

      if (attempt < DB_RETRY_ATTEMPTS) {
        await delay(DB_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

async function startServer() {
  try {
    ensurePlaywrightChromium();
    await connectDatabaseWithRetry();

    // Sync models (in development)
    if (config.server?.nodeEnv === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }

    const defaultAdmin = await ensureDefaultAdmin();
    if (defaultAdmin) {
      logger.info(`Admin user available: ${defaultAdmin.email}`);
    }

    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
