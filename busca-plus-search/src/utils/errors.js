class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorTypes = {
  NOT_FOUND: (resource) => new AppError(`${resource} nao encontrado`, 404),
  VALIDATION: (message) => new AppError(message, 400),
  UNAUTHORIZED: (message = 'Nao autorizado') => new AppError(message, 401),
  SERVICE_UNAVAILABLE: (message = 'Servico temporariamente indisponivel') => new AppError(message, 503),
  INTERNAL: (message = 'Erro interno do servidor') => new AppError(message, 500),
};

module.exports = {
  AppError,
  errorTypes,
};
