const fs = require('fs');
const path = require('path');

const SETTINGS_DIRECTORY = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(SETTINGS_DIRECTORY, 'ai-settings.json');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  provider: 'ollama',
  summaryMaxCharacters: 1000,
  timeout: 300000,
  features: {
    pageSummary: false,
    searchReport: false,
    searchOverview: false,
    embeddings: false,
  },
  searchOverview: {
    maxChunks: 8,
    cacheMinutes: 240,
    minScore: 0.12,
  },
  embeddings: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    chunkCharacters: 1800,
    chunkOverlap: 250,
    batchLimit: 50,
  },
  google: {
    enabled: false,
    apiKey: '',
    model: 'gemini-2.0-flash',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  ollama: {
    enabled: false,
    baseUrl: 'http://127.0.0.1:11434',
    model: 'llama3.1:8b',
  },
});

class AiSettingsService {
  constructor({ filePath = SETTINGS_FILE, defaults = DEFAULT_SETTINGS } = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  ensureStorage() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  parseNumber(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(parsed, min), max);
  }

  parseTimeout(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 30000) {
      return fallback;
    }
    return Math.min(parsed, 600000);
  }

  normalizeSettings(raw = {}) {
    const provider = String(raw.provider || this.defaults.provider || 'ollama').toLowerCase();

    return {
      enabled: Boolean(raw.enabled),
      provider: ['google', 'ollama'].includes(provider) ? provider : this.defaults.provider,
      summaryMaxCharacters: this.parseNumber(
        raw.summaryMaxCharacters,
        this.defaults.summaryMaxCharacters,
        1000,
        50000
      ),
      timeout: this.parseTimeout(raw.timeout, this.defaults.timeout),
      features: {
        pageSummary: Boolean(raw.features?.pageSummary),
        searchReport: Boolean(raw.features?.searchReport),
        searchOverview: Boolean(raw.features?.searchOverview),
        embeddings: Boolean(raw.features?.embeddings),
      },
      searchOverview: {
        maxChunks: this.parseNumber(
          raw.searchOverview?.maxChunks,
          this.defaults.searchOverview.maxChunks,
          3,
          20
        ),
        cacheMinutes: this.parseNumber(
          raw.searchOverview?.cacheMinutes,
          this.defaults.searchOverview.cacheMinutes,
          0,
          1440
        ),
        minScore: Math.min(
          Math.max(Number.parseFloat(raw.searchOverview?.minScore ?? this.defaults.searchOverview.minScore), 0),
          1
        ),
      },
      embeddings: {
        provider: String(raw.embeddings?.provider || this.defaults.embeddings.provider || 'ollama').toLowerCase() === 'ollama'
          ? 'ollama'
          : this.defaults.embeddings.provider,
        model: String(raw.embeddings?.model ?? this.defaults.embeddings.model ?? '').trim(),
        chunkCharacters: this.parseNumber(
          raw.embeddings?.chunkCharacters,
          this.defaults.embeddings.chunkCharacters,
          500,
          6000
        ),
        chunkOverlap: this.parseNumber(
          raw.embeddings?.chunkOverlap,
          this.defaults.embeddings.chunkOverlap,
          0,
          1000
        ),
        batchLimit: this.parseNumber(
          raw.embeddings?.batchLimit,
          this.defaults.embeddings.batchLimit,
          1,
          500
        ),
      },
      google: {
        enabled: Boolean(raw.google?.enabled),
        apiKey: String(raw.google?.apiKey ?? this.defaults.google.apiKey ?? '').trim(),
        model: String(raw.google?.model ?? this.defaults.google.model ?? '').trim(),
        apiUrl: String(raw.google?.apiUrl ?? this.defaults.google.apiUrl ?? '').trim(),
      },
      ollama: {
        enabled: Boolean(raw.ollama?.enabled),
        baseUrl: String(raw.ollama?.baseUrl ?? this.defaults.ollama.baseUrl ?? '').trim(),
        model: String(raw.ollama?.model ?? this.defaults.ollama.model ?? '').trim(),
      },
    };
  }

  readRawSettings() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }

      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (error) {
      return null;
    }
  }

  writeSettings(settings) {
    this.ensureStorage();
    fs.writeFileSync(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    return settings;
  }

  getSettings() {
    const settings = this.normalizeSettings(this.readRawSettings() || {});

    if (!fs.existsSync(this.filePath)) {
      this.writeSettings(settings);
    }

    return settings;
  }

  updateSettings(payload = {}) {
    return this.writeSettings(this.normalizeSettings(payload));
  }
}

const aiSettingsService = new AiSettingsService();

module.exports = aiSettingsService;
module.exports.AiSettingsService = AiSettingsService;
