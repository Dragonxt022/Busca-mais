const { AppError, errorTypes } = require('../../utils/errors');

const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const isValidCron = (cron) => {
  const cronPattern = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
  return cronPattern.test(cron);
};

const validateSource = (data) => {
  const errors = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push('Nome deve ter pelo menos 2 caracteres');
  }

  if (!data.url && !data.base_url) {
    errors.push('URL é obrigatória');
  } else {
    const url = data.url || data.base_url;
    if (!isValidUrl(url)) {
      errors.push('URL inválida');
    }
  }

  if (data.schedule && !isValidCron(data.schedule)) {
    errors.push('Expressão cron inválida');
  }

  if (data.crawl_depth && (data.crawl_depth < 1 || data.crawl_depth > 10)) {
    errors.push('Profundidade deve ser entre 1 e 10');
  }

  if (errors.length > 0) {
    throw errorTypes.VALIDATION(errors.join(', '));
  }

  return {
    name: data.name.trim(),
    base_url: data.url || data.base_url,
    category: data.category || null,
    type: data.type || 'website',
    crawl_depth: data.crawl_depth || 3,
    follow_internal_links: !!data.followInternalLinks || !!data.follow_internal_links,
    take_screenshot: data.takeScreenshot !== false && data.take_screenshot !== false,
    schedule: data.schedule || null,
  };
};

const validatePage = (data) => {
  const errors = [];

  if (!data.url && !data.url) {
    errors.push('URL é obrigatória');
  } else {
    const url = data.url;
    if (!isValidUrl(url)) {
      errors.push('URL inválida');
    }
  }

  if (data.source_id && typeof data.source_id !== 'number') {
    errors.push('source_id deve ser um número');
  }

  if (errors.length > 0) {
    throw errorTypes.VALIDATION(errors.join(', '));
  }

  return {
    url: data.url,
    source_id: data.source_id || null,
    is_active: data.is_active !== false,
  };
};

const validatePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

const validateSchedule = (schedule) => {
  if (!schedule) return null;
  
  if (!isValidCron(schedule)) {
    throw errorTypes.VALIDATION('Expressão cron inválida');
  }
  
  return schedule;
};

module.exports = {
  validateSource,
  validatePage,
  validatePagination,
  validateSchedule,
  isValidUrl,
  isValidCron,
};
