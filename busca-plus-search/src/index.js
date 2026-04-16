const app = require('./app');
const { logger } = require('./libs/logger');
const config = require('./config');

const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info(`Search UI running on port ${PORT}`);
  logger.info(`Interface available at http://localhost:${PORT}`);
});