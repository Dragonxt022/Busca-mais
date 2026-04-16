const { AppError } = require('../../utils/errors');
const { logger } = require('../../libs/logger');

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).render('error', {
      message: err.message,
      error: { status: err.statusCode },
    });
  }

  logger.error('Unhandled error:', err);

  return res.status(500).render('error', {
    message: 'Erro interno do servidor',
    error: { status: 500 },
  });
};

const notFoundHandler = (req, res) => {
  return res.status(404).render('error', {
    message: 'Pagina nao encontrada',
    error: { status: 404 },
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
