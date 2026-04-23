const { errorHandler, notFoundHandler } = require('./error.middleware');
const { imageProxyMiddleware, uploadProxyMiddleware } = require('./image-proxy.middleware');

module.exports = {
  errorHandler,
  imageProxyMiddleware,
  uploadProxyMiddleware,
  notFoundHandler,
};
