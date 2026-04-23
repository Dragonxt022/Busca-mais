/**
 * Contrato base para todos os adaptadores do motor de busca.
 *
 * Cada adaptador e responsavel por:
 * 1. Avaliar se consegue processar uma entrada (canHandle)
 * 2. Extrair ContentItem[] da entrada (extract)
 *
 * O score de canHandle permite escolher o melhor adaptador quando varios
 * conseguem lidar com a mesma entrada (maior score = maior prioridade).
 */
class BaseAdapter {
  constructor(name) {
    this.name = name;
  }

  /**
   * Avalia se este adaptador consegue processar a entrada.
   * @param {AdapterInput} input
   * @returns {number} Score de 0 (nao consegue) a 1 (ideal para este adaptador)
   */
  // eslint-disable-next-line no-unused-vars
  canHandle(input) {
    return 0;
  }

  /**
   * Extrai itens de conteudo da entrada.
   * @param {AdapterInput} input
   * @returns {Promise<ExtractedItem[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async extract(input) {
    throw new Error(`Adaptador ${this.name} nao implementou extract()`);
  }
}

/**
 * @typedef {Object} AdapterInput
 * @property {string} url - URL original da requisicao
 * @property {string} [html] - Conteudo HTML bruto
 * @property {Buffer} [buffer] - Conteudo binario (PDFs, etc)
 * @property {string} contentType - MIME type detectado
 * @property {string} classifiedAs - Tipo detectado pelo Classifier
 * @property {Object} source - SearchableSource da entrada
 * @property {Object} [config] - Configuracao extra do source
 */

/**
 * @typedef {Object} ExtractedItem
 * @property {string} url
 * @property {string} [canonicalUrl]
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [textContent]
 * @property {string} [markdownContent]
 * @property {string} itemKind - page|news|official_document|pdf|protocol|attachment|listing_item|other
 * @property {string} [documentType]
 * @property {string} [documentNumber]
 * @property {string} [publicationDate]
 * @property {string} [department]
 * @property {string} [fileUrl]
 * @property {string} [fileExtension]
 * @property {Object} [metadata]
 * @property {Array} [images]
 * @property {string[]} [discoveredUrls] - Novos links para enfileirar
 */

module.exports = BaseAdapter;
