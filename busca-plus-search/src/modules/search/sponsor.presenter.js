const MAX_VISIBLE_SPONSORS = 5;
const TOP_SLOT_COUNT = 2;
const SIDEBAR_SLOT_COUNT = 2;
const INLINE_INSERT_INDEX = 3;
const INLINE_SLOT_COUNT = 1;

const STOPWORDS = new Set([
  'a', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos',
  'o', 'os', 'para', 'por', 'um', 'uma',
]);

const tokenize = (value) => String(value || '')
  .toLowerCase()
  .split(/[^a-z0-9À-ÿ]+/i)
  .map((token) => token.trim())
  .filter((token) => token.length >= 2 && !STOPWORDS.has(token));

const unique = (items) => Array.from(new Set(items.filter(Boolean)));

const normalizeUrlLabel = (url) => String(url || '')
  .replace(/^https?:\/\//i, '')
  .replace(/\/$/, '');

const normalizeImages = (images) => {
  if (!Array.isArray(images)) {
    return [];
  }

  return images.filter(Boolean).slice(0, 3);
};

const hashString = (value) => {
  let hash = 0;

  for (const char of String(value || '')) {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  }

  return Math.abs(hash);
};

const computeSpecificityScore = ({ sponsor, state, city }) => {
  if (city && state && sponsor.city && sponsor.state
    && sponsor.city.toLowerCase() === city.toLowerCase()
    && sponsor.state.toUpperCase() === state.toUpperCase()) {
    return 24;
  }

  if (state && sponsor.state && sponsor.state.toUpperCase() === state.toUpperCase() && !sponsor.city) {
    return 16;
  }

  if (!sponsor.state && !sponsor.city) {
    return 8;
  }

  return 4;
};

const computeRelevanceScore = ({ sponsor, queryTokens = [], state, city }) => {
  const haystack = unique([
    sponsor.name,
    sponsor.description,
    sponsor.city,
    sponsor.state,
    normalizeUrlLabel(sponsor.url),
  ]).join(' ').toLowerCase();
  const overlap = queryTokens.filter((token) => haystack.includes(token)).length;
  const phraseBonus = queryTokens.length > 1 && haystack.includes(queryTokens.join(' ')) ? 6 : 0;
  const imageBonus = normalizeImages(sponsor.images).length > 0 ? 2 : 0;

  return (overlap * 5)
    + phraseBonus
    + imageBonus
    + computeSpecificityScore({ sponsor, state, city });
};

const normalizeSponsor = (sponsor) => ({
  ...sponsor,
  id: sponsor.id,
  name: String(sponsor.name || '').trim(),
  description: String(sponsor.description || '').trim(),
  url: String(sponsor.url || '').trim(),
  urlLabel: normalizeUrlLabel(sponsor.url),
  images: normalizeImages(sponsor.images),
});

const pickSponsorsForSlots = ({ rankedSponsors = [], resultCount = 0 }) => {
  const pool = rankedSponsors.slice(0, MAX_VISIBLE_SPONSORS);
  const top = pool.slice(0, TOP_SLOT_COUNT);
  let cursor = top.length;

  const inline = [];
  if (resultCount >= INLINE_INSERT_INDEX && cursor < pool.length) {
    const inlineSponsor = pool[cursor];
    inline.push({
      insertAfter: INLINE_INSERT_INDEX,
      sponsor: inlineSponsor,
    });
    cursor += INLINE_SLOT_COUNT;
  }

  const sidebar = pool.slice(cursor, cursor + SIDEBAR_SLOT_COUNT);

  return {
    top,
    inline,
    sidebar,
  };
};

const buildSponsoredExperience = ({
  query = '',
  page = 1,
  results = [],
  sponsors = [],
  state = null,
  city = null,
} = {}) => {
  const normalizedSponsors = Array.isArray(sponsors)
    ? sponsors.map(normalizeSponsor).filter((sponsor) => sponsor.id && sponsor.name && sponsor.url)
    : [];

  if (normalizedSponsors.length === 0) {
    return null;
  }

  const queryTokens = tokenize(query);
  const rotationSeed = `${query}|${page}|${state || ''}|${city || ''}|${new Date().toISOString().slice(0, 10)}`;
  const rankedSponsors = normalizedSponsors
    .map((sponsor) => ({
      ...sponsor,
      matchScore: computeRelevanceScore({ sponsor, queryTokens, state, city }),
      rotationScore: hashString(`${rotationSeed}|${sponsor.id}`),
    }))
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) {
        return right.matchScore - left.matchScore;
      }

      if (left.rotationScore !== right.rotationScore) {
        return left.rotationScore - right.rotationScore;
      }

      return String(left.name).localeCompare(String(right.name), 'pt-BR');
    });

  const slots = pickSponsorsForSlots({
    rankedSponsors,
    resultCount: Array.isArray(results) ? results.length : 0,
  });
  const visibleCount = slots.top.length + slots.inline.length + slots.sidebar.length;

  return {
    slots,
    totalEligible: rankedSponsors.length,
    visibleCount,
    hiddenCount: Math.max(rankedSponsors.length - visibleCount, 0),
    policy: {
      maxVisible: MAX_VISIBLE_SPONSORS,
      topSlots: TOP_SLOT_COUNT,
      sidebarSlots: SIDEBAR_SLOT_COUNT,
      inlineInsertAfter: INLINE_INSERT_INDEX,
    },
    summaryLabel: rankedSponsors.length > visibleCount
      ? `Mostrando ${visibleCount} de ${rankedSponsors.length} patrocinados elegiveis para esta busca`
      : `${visibleCount} patrocinado${visibleCount > 1 ? 's' : ''} selecionado${visibleCount > 1 ? 's' : ''} para esta busca`,
  };
};

module.exports = {
  buildSponsoredExperience,
};
