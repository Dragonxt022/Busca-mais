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
  const parsedDepth = data.crawl_depth !== undefined
    ? parseInt(data.crawl_depth, 10)
    : (data.crawlDepth !== undefined ? parseInt(data.crawlDepth, 10) : undefined);
  const parsedDelay = data.delay_between_requests !== undefined
    ? parseInt(data.delay_between_requests, 10)
    : (data.delayBetweenRequests !== undefined ? parseInt(data.delayBetweenRequests, 10) : undefined);

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

  if (parsedDepth !== undefined && (!Number.isInteger(parsedDepth) || parsedDepth < 1 || parsedDepth > 10)) {
    errors.push('Profundidade deve ser entre 1 e 10');
  }

  if (errors.length > 0) {
    throw errorTypes.VALIDATION(errors.join(', '));
  }

  const VALID_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const state = String(data.state || '').toUpperCase().trim();

  const rawMaxPages = data.max_pages ?? data.maxPages;
  const parsedMaxPages = rawMaxPages ? parseInt(rawMaxPages, 10) : null;
  const contentSelector = String(data.contentSelector ?? data.content_selector ?? data?.config_json?.contentSelector ?? '', '').trim();
  const rawExcludeSelectors = data.excludeSelectors
    ?? data.exclude_selectors
    ?? data?.config_json?.excludeSelectors
    ?? '';
  const excludeSelectors = Array.isArray(rawExcludeSelectors)
    ? rawExcludeSelectors.map((item) => String(item || '').trim()).filter(Boolean)
    : String(rawExcludeSelectors || '')
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

  return {
    name: data.name.trim(),
    base_url: data.url || data.base_url,
    category: data.category || null,
    type: data.type || 'website',
    crawl_depth: parsedDepth !== undefined ? parsedDepth : 3,
    follow_internal_links: !!data.followInternalLinks || !!data.follow_internal_links,
    download_images: data.downloadImages === true || data.download_images === true,
    take_screenshots: data.takeScreenshots === true || data.take_screenshots === true,
    delay_between_requests: parsedDelay !== undefined && Number.isFinite(parsedDelay) ? parsedDelay : 1000,
    user_agent: data.userAgent || data.user_agent || null,
    is_active: data.isActive !== undefined ? data.isActive : (data.status !== 'inactive'),
    schedule: data.schedule || null,
    state: VALID_UF.includes(state) ? state : null,
    city: String(data.city || '').trim() || null,
    max_pages: parsedMaxPages && parsedMaxPages > 0 ? parsedMaxPages : null,
    configJson: {
      contentSelector: contentSelector || null,
      excludeSelectors,
    },
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
