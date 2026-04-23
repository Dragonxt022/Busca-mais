const axios = require('axios');

const config = require('../../config');

function createCrawlerAssetProxyMiddleware(routePrefix, fallbackContentType = 'application/octet-stream') {
  return async (req, res) => {
    try {
      const response = await axios({
        method: 'get',
        url: `${config.crawler.apiUrl}${routePrefix}${req.path}`,
        responseType: 'stream',
        timeout: 10000,
      });

      res.header('Access-Control-Allow-Origin', '*');
      res.header('Cross-Origin-Resource-Policy', 'cross-origin');
      res.header('Content-Type', response.headers['content-type'] || fallbackContentType);

      response.data.pipe(res);
    } catch (error) {
      res.status(404).send('Image not found');
    }
  };
}

const imageProxyMiddleware = createCrawlerAssetProxyMiddleware('/images', 'image/jpeg');
const uploadProxyMiddleware = createCrawlerAssetProxyMiddleware('/uploads');

module.exports = {
  createCrawlerAssetProxyMiddleware,
  imageProxyMiddleware,
  uploadProxyMiddleware,
};
