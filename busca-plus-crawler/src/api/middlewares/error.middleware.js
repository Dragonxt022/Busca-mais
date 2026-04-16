const { AppError, errorTypes } = require('../../utils/errors');
const { logger } = require('../../libs/logger');

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  logger.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
