const fs = require('fs');
const path = require('path');

const SETTINGS_DIRECTORY = path.resolve(process.cwd(), 'data');
const SETTINGS_FILE = path.join(SETTINGS_DIRECTORY, 'email-settings.json');

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  password: '',
  fromName: 'Busca+',
  fromEmail: '',
  appUrl: 'http://localhost:3000',
});

class EmailSettingsService {
  constructor({ filePath = SETTINGS_FILE, defaults = DEFAULT_SETTINGS } = {}) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  ensureStorage() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  parsePort(value) {
    const port = Number.parseInt(value, 10);
    if (!Number.isFinite(port)) {
      return this.defaults.port;
    }
    return Math.min(Math.max(port, 1), 65535);
  }

  normalizeSettings(raw = {}) {
    return {
      enabled: Boolean(raw.enabled),
      host: String(raw.host ?? this.defaults.host).trim(),
      port: this.parsePort(raw.port ?? this.defaults.port),
      secure: Boolean(raw.secure),
      user: String(raw.user ?? this.defaults.user).trim(),
      password: String(raw.password ?? this.defaults.password),
      fromName: String(raw.fromName ?? this.defaults.fromName).trim() || this.defaults.fromName,
      fromEmail: String(raw.fromEmail ?? this.defaults.fromEmail).trim(),
      appUrl: String(raw.appUrl ?? this.defaults.appUrl).trim().replace(/\/$/, '') || this.defaults.appUrl,
    };
  }

  readRawSettings() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
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

  getPublicSettings() {
    const settings = this.getSettings();
    return {
      ...settings,
      password: settings.password ? '********' : '',
      configured: Boolean(settings.enabled && settings.host && settings.fromEmail),
    };
  }

  updateSettings(payload = {}) {
    const current = this.getSettings();
    const nextPayload = { ...payload };
    if (nextPayload.password === '********') {
      nextPayload.password = current.password;
    }
    return this.writeSettings(this.normalizeSettings(nextPayload));
  }
}

const emailSettingsService = new EmailSettingsService();

module.exports = emailSettingsService;
module.exports.EmailSettingsService = EmailSettingsService;
