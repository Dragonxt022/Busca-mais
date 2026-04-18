const fs = require('fs');
const path = require('path');

const SETTINGS_DIRECTORY = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(SETTINGS_DIRECTORY, 'ai-settings.json');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  provider: 'ollama',
  summaryMaxCharacters: 12000,
  features: {
    pageSummary: false,
    searchReport: false,
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
      features: {
        pageSummary: Boolean(raw.features?.pageSummary),
        searchReport: Boolean(raw.features?.searchReport),
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
