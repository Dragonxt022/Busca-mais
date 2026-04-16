const axios = require('axios');

const config = require('../../config');

const imageProxyMiddleware = async (req, res) => {
  try {
    const response = await axios({
      method: 'get',
      url: `${config.crawler.apiUrl}/images${req.path}`,
      responseType: 'stream',
      timeout: 10000,
    });

    res.header('Access-Control-Allow-Origin', '*');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Content-Type', response.headers['content-type'] || 'image/jpeg');

    response.data.pipe(res);
  } catch (error) {
    res.status(404).send('Image not found');
  }
};

module.exports = {
  imageProxyMiddleware,
};
