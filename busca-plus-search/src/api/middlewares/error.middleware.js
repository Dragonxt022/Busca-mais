const { AppError } = require('../../utils/errors');
const { logger } = require('../../libs/logger');

const isApiRequest = (req) => String(req.originalUrl || req.url || '').startsWith('/api/');

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    if (isApiRequest(req)) {
      return res.status(err.statusCode).json({
        error: err.message,
        status: err.statusCode,
      });
    }

    return res.status(err.statusCode).render('error', {
      message: err.message,
      error: { status: err.statusCode },
    });
  }

  logger.error('Unhandled error:', err);

  if (isApiRequest(req)) {
    return res.status(500).json({
      error: 'Erro interno do servidor',
      status: 500,
    });
  }

  return res.status(500).render('error', {
    message: 'Erro interno do servidor',
    error: { status: 500 },
  });
};

const notFoundHandler = (req, res) => {
  if (isApiRequest(req)) {
    return res.status(404).json({
      error: 'Pagina nao encontrada',
      status: 404,
    });
  }

  return res.status(404).render('error', {
    message: 'Pagina nao encontrada',
    error: { status: 404 },
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
