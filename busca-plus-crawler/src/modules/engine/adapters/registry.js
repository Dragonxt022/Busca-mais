/**
 * Registro de todos os adaptadores disponíveis.
 * A ordem importa como desempate quando dois adaptadores têm o mesmo score.
 */
const adapters = [
  require('./file-pdf.adapter'),
  require('./detail-document.adapter'),
  require('./site-news.adapter'),
  require('./listing-table.adapter'),
  require('./api-generic.adapter'),
  require('./site-page.adapter'), // fallback genérico por último
];

/**
 * Seleciona o melhor adaptador para a entrada.
 * @param {Object} input - AdapterInput com classifiedAs populado
 * @returns {{ adapter, score }}
 */
function selectAdapter(input) {
  let best = null;
  let bestScore = 0;

  for (const adapter of adapters) {
    const score = adapter.canHandle(input);
    if (score > bestScore) {
      bestScore = score;
      best = adapter;
    }
  }

  return { adapter: best, score: bestScore };
}

module.exports = { adapters, selectAdapter };
