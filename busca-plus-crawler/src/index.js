// Load environment variables first
require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');
const { logger } = require('./libs/logger');
const config = require('./config');

const PORT = config.server.port;

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models (in development)
    if (config.nodeEnv === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
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