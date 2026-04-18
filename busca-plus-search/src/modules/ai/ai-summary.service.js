const axios = require('axios');

const config = require('../../config');
const { errorTypes } = require('../../utils/errors');

class AiSummaryService {
  constructor({
    axiosInstance = axios,
    aiConfig = null,
    settingsLoader = null,
    settingsApiUrl = `${String(config.crawler?.apiUrl || '').replace(/\/$/, '')}/api/admin/ai-settings`,
  } = {}) {
    this.axios = axiosInstance;
    this.aiConfig = aiConfig;
    this.settingsLoader = settingsLoader;
    this.settingsApiUrl = settingsApiUrl;
  }

  buildFallbackConfig() {
    return {
      enabled: false,
      provider: String(config.ai?.provider || 'ollama').toLowerCase(),
      summaryMaxCharacters: config.ai?.summaryMaxCharacters || 12000,
      features: {
        pageSummary: false,
        searchReport: false,
      },
      google: {
        enabled: false,
        apiKey: String(config.ai?.google?.apiKey || ''),
        model: String(config.ai?.google?.model || 'gemini-2.0-flash'),
        apiUrl: String(config.ai?.google?.apiUrl || 'https://generativelanguage.googleapis.com/v1beta/models'),
      },
      ollama: {
        enabled: false,
        baseUrl: String(config.ai?.ollama?.baseUrl || 'http://127.0.0.1:11434'),
        model: String(config.ai?.ollama?.model || 'llama3.1:8b'),
      },
    };
  }

  normalizeConfig(raw = {}) {
    const fallback = this.buildFallbackConfig();
    const provider = String(raw.provider || fallback.provider || 'ollama').toLowerCase();

    return {
      enabled: Boolean(raw.enabled),
      provider: ['google', 'ollama'].includes(provider) ? provider : fallback.provider,
      summaryMaxCharacters: Number.parseInt(raw.summaryMaxCharacters, 10) || fallback.summaryMaxCharacters,
      features: {
        pageSummary: Boolean(raw.features?.pageSummary),
        searchReport: Boolean(raw.features?.searchReport),
      },
      google: {
        enabled: Boolean(raw.google?.enabled),
        apiKey: String(raw.google?.apiKey ?? fallback.google.apiKey ?? ''),
        model: String(raw.google?.model ?? fallback.google.model ?? ''),
        apiUrl: String(raw.google?.apiUrl ?? fallback.google.apiUrl ?? ''),
      },
      ollama: {
        enabled: Boolean(raw.ollama?.enabled),
        baseUrl: String(raw.ollama?.baseUrl ?? fallback.ollama.baseUrl ?? ''),
        model: String(raw.ollama?.model ?? fallback.ollama.model ?? ''),
      },
    };
  }

  async getConfig() {
    if (this.aiConfig) {
      return this.normalizeConfig(this.aiConfig);
    }

    if (this.settingsLoader) {
      return this.normalizeConfig(await this.settingsLoader());
    }

    try {
      const response = await this.axios.get(this.settingsApiUrl, {
        timeout: 10000,
      });

      return this.normalizeConfig(response.data || {});
    } catch (error) {
      return this.buildFallbackConfig();
    }
  }

  sanitizeText(value, maxLength = 12000) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLength);
  }

  buildPrompt({ title, content, query = '', sourceName = '', url = '' }) {
    const safeTitle = this.sanitizeText(title, 500);
    const safeContent = this.sanitizeText(content);
    const safeQuery = this.sanitizeText(query, 200);
    const safeSource = this.sanitizeText(sourceName, 200);
    const safeUrl = this.sanitizeText(url, 500);

    return [
      'Voce e um assistente que resume documentos publicos em portugues do Brasil.',
      'Produza um resumo curto, objetivo e util para leitura rapida.',
      'Regras:',
      '- Responda em portugues.',
      '- Use no maximo 6 bullets curtos.',
      '- Diga o assunto central, pontos principais, datas ou numeros relevantes se existirem.',
      '- Nao invente informacoes ausentes.',
      safeQuery ? `- Considere que a busca do usuario foi: "${safeQuery}".` : '',
      '',
      `Titulo: ${safeTitle || 'Documento sem titulo'}`,
      `Fonte: ${safeSource || 'Fonte nao informada'}`,
      safeUrl ? `URL: ${safeUrl}` : '',
      '',
      'Conteudo do documento:',
      safeContent || 'Conteudo nao disponivel.',
    ].filter(Boolean).join('\n');
  }

  normalizeSummary(value) {
    const text = String(value || '')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text || text.length < 5) {
      throw errorTypes.INTERNAL('A IA nao retornou um resumo valido');
    }

    return text;
  }

  mapProviderError(error, provider) {
    const status = error?.response?.status || 0;
    const apiMessage =
      error?.response?.data?.error?.message
      || error?.response?.data?.message
      || error?.message
      || 'Falha ao gerar resumo com IA';

    if (provider === 'google') {
      if (status === 429) {
        throw errorTypes.VALIDATION(`Google AI indisponivel no momento: ${apiMessage}`);
      }

      if (status === 400 || status === 401 || status === 403) {
        throw errorTypes.VALIDATION(`Falha na configuracao da Google AI: ${apiMessage}`);
      }
    }

    if (provider === 'ollama') {
      if (error?.code === 'ECONNREFUSED') {
        throw errorTypes.VALIDATION('Ollama nao esta acessivel no endereco configurado.');
      }
    }

    throw errorTypes.INTERNAL(apiMessage);
  }

  ensureFeatureEnabled(runtimeConfig, feature) {
    if (!runtimeConfig?.enabled) {
      throw errorTypes.VALIDATION('As ferramentas de IA estao desativadas no administrador.');
    }

    if (feature === 'pageSummary' && !runtimeConfig?.features?.pageSummary) {
      throw errorTypes.VALIDATION('O resumo de pagina com IA esta desativado no administrador.');
    }

    if (feature === 'searchReport' && !runtimeConfig?.features?.searchReport) {
      throw errorTypes.VALIDATION('O relatorio de busca com IA esta desativado no administrador.');
    }
  }

  async summarizeWithGoogle(prompt, runtimeConfig) {
    const { apiKey, model, apiUrl, enabled } = runtimeConfig.google || {};

    if (!enabled) {
      throw errorTypes.VALIDATION('O provedor Google AI esta desativado no administrador.');
    }

    if (!apiKey) {
      throw errorTypes.VALIDATION('GOOGLE_AI_API_KEY nao configurada');
    }

    let response;

    try {
      response = await this.axios.post(
        `${apiUrl}/${model}:generateContent`,
        {
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.8,
            maxOutputTokens: 700,
          },
        },
        {
          params: { key: apiKey },
          timeout: 45000,
        }
      );
    } catch (error) {
      this.mapProviderError(error, 'google');
    }

    const parts = response.data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part) => part.text || '').join('\n').trim();

    return {
      provider: 'google',
      model,
      summary: this.normalizeSummary(text),
    };
  }

  async summarizeWithOllama(prompt, runtimeConfig) {
    const { baseUrl, model, enabled } = runtimeConfig.ollama || {};

    if (!enabled) {
      throw errorTypes.VALIDATION('O provedor Ollama esta desativado no administrador.');
    }

    let response;

    try {
      response = await this.axios.post(
        `${String(baseUrl || '').replace(/\/$/, '')}/api/generate`,
        {
          model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 400,
          },
        },
        {
          timeout: 120000,
        }
      );
    } catch (error) {
      console.error('Ollama error:', error?.response?.data || error.message);
      this.mapProviderError(error, 'ollama');
    }

    const rawResponse = response?.data?.response || '';
    console.log('Ollama raw response length:', rawResponse.length);

    if (!rawResponse || rawResponse.trim().length < 5) {
      throw errorTypes.INTERNAL('A IA retornou uma resposta vazia ou muito curta');
    }

    return {
      provider: 'ollama',
      model,
      summary: this.normalizeSummary(rawResponse),
    };
  }

  async summarizeDocument(document, options = {}) {
    const runtimeConfig = await this.getConfig();
    const maxLength = runtimeConfig?.summaryMaxCharacters || 12000;
    const prompt = this.buildPrompt({
      title: document?.title,
      content: this.sanitizeText(
        document?.markdownContent || document?.content || document?.description || document?.summary || '',
        maxLength
      ),
      sourceName: document?.sourceName,
      url: document?.url,
      query: options.query || '',
    });

    if (!this.sanitizeText(prompt, 50)) {
      throw errorTypes.VALIDATION('Documento sem conteudo suficiente para resumo');
    }

    this.ensureFeatureEnabled(runtimeConfig, options.feature);

    const provider = String(runtimeConfig.provider || 'ollama').toLowerCase();

    if (provider === 'google') {
      return this.summarizeWithGoogle(prompt, runtimeConfig);
    }

    if (provider === 'ollama') {
      return this.summarizeWithOllama(prompt, runtimeConfig);
    }

    throw errorTypes.VALIDATION(`Provedor de IA nao suportado: ${provider}`);
  }
}

module.exports = AiSummaryService;
