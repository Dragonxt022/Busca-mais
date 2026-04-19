const https = require('https');
const { Op } = require('sequelize');
const { Source, CatalogSource, Sponsor } = require('../models');

class BrazilCitiesService {
  constructor() {
    this.cache = new Map();
    this.cacheTtlMs = 24 * 60 * 60 * 1000;
  }

  async getCitiesByState(state) {
    const normalizedState = String(state || '').trim().toUpperCase();
    if (!normalizedState) {
      return [];
    }

    const cached = this.cache.get(normalizedState);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    let cities = [];

    try {
      cities = await this.fetchFromIbge(normalizedState);
    } catch (_) {
      cities = [];
    }

    if (!cities.length) {
      cities = await this.fetchFromDatabase(normalizedState);
    }

    const deduped = [...new Set(cities.map((city) => String(city || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    this.cache.set(normalizedState, {
      data: deduped,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return deduped;
  }

  fetchFromIbge(state) {
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(state)}/municipios`;

    return new Promise((resolve, reject) => {
      const req = https.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`IBGE status ${res.statusCode}`));
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const cities = Array.isArray(parsed)
              ? parsed.map((item) => item?.nome).filter(Boolean)
              : [];
            resolve(cities);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('IBGE timeout'));
      });
      req.on('error', reject);
    });
  }

  async fetchFromDatabase(state) {
    const [sources, catalogSources, sponsors] = await Promise.all([
      Source.findAll({
        where: { state, city: { [Op.ne]: null } },
        attributes: ['city'],
        raw: true,
      }),
      CatalogSource.findAll({
        where: { state, city: { [Op.ne]: null } },
        attributes: ['city'],
        raw: true,
      }),
      Sponsor.findAll({
        where: { state, city: { [Op.ne]: null } },
        attributes: ['city'],
        raw: true,
      }),
    ]);

    return [...sources, ...catalogSources, ...sponsors].map((item) => item.city);
  }
}

module.exports = new BrazilCitiesService();
