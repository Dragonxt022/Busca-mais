const { errorHandler, notFoundHandler } = require('./error.middleware');
const { imageProxyMiddleware } = require('./image-proxy.middleware');

module.exports = {
  errorHandler,
  imageProxyMiddleware,
  notFoundHandler,
};
