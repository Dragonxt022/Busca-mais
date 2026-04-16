const { errorTypes } = require('../../utils/errors');

const sanitizeQuery = (query) => {
  if (!query || typeof query !== 'string') {
    return '';
  }

  return query.trim().substring(0, 500);
};

const validateSearch = (query) => {
  const sanitized = sanitizeQuery(query.q);

  if (!sanitized) {
    return null;
  }

  if (sanitized.length < 2) {
    throw errorTypes.VALIDATION('Query deve ter pelo menos 2 caracteres');
  }

  return {
    query: sanitized,
    page: Math.max(1, parseInt(query.page, 10) || 1),
    sourceId: query.source || null,
  };
};

const validatePageId = (id) => {
  if (!id || Number.isNaN(parseInt(id, 10))) {
    throw errorTypes.NOT_FOUND('Pagina');
  }

  return parseInt(id, 10);
};

const validateSuggestion = (query) => {
  if (!query || typeof query !== 'string' || query.length < 2) {
    return null;
  }

  return sanitizeQuery(query);
};

module.exports = {
  sanitizeQuery,
  validateSearch,
  validatePageId,
  validateSuggestion,
};
