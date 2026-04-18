const express = require('express');
const { Op } = require('sequelize');
const Sponsor = require('../../models/sponsor.model');

const router = express.Router();

// ─── Public API ───────────────────────────────────────────────────────────────

// GET /api/sponsors — active sponsors optionally filtered by state/city
router.get('/api/sponsors', async (req, res) => {
  try {
    const { state, city } = req.query;
    const today = new Date().toISOString().slice(0, 10);

    const where = {
      is_active: true,
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today },
    };

    if (state || city) {
      where[Op.or] = [
        { state: null, city: null },
      ];
      if (state) where[Op.or].push({ state });
      if (city) where[Op.or].push({ city });
    }

    const sponsors = await Sponsor.findAll({
      where,
      order: [['created_at', 'ASC']],
      limit: 3,
    });

    res.json(sponsors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sponsors/:id/click — track click
router.post('/api/sponsors/:id/click', async (req, res) => {
  try {
    const sponsor = await Sponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Sponsor not found' });
    await sponsor.increment('click_count');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cities — distinct cities registered in sources filtered by state
router.get('/api/cities', async (req, res) => {
  try {
    const { Source } = require('../../models');
    const { state } = req.query;
    const where = { city: { [Op.ne]: null }, is_active: true };
    if (state) where.state = state;

    const sources = await Source.findAll({
      where,
      attributes: ['city', 'state'],
      group: ['city', 'state'],
      order: [['city', 'ASC']],
    });

    const cities = [...new Set(sources.map((s) => s.city).filter(Boolean))];
    res.json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin API ────────────────────────────────────────────────────────────────

router.post('/api/admin/sponsors', async (req, res) => {
  try {
    const { name, url, description, state, city, start_date, end_date, is_active } = req.body;
    if (!name || !url || !start_date || !end_date) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, url, start_date, end_date' });
    }
    const sponsor = await Sponsor.create({
      name: String(name).trim(),
      url: String(url).trim(),
      description: description ? String(description).trim() : null,
      state: state || null,
      city: city ? String(city).trim() : null,
      start_date,
      end_date,
      is_active: is_active !== false,
    });
    res.status(201).json(sponsor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/admin/sponsors/:id', async (req, res) => {
  try {
    const sponsor = await Sponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Patrocínio não encontrado' });

    const { name, url, description, state, city, start_date, end_date, is_active } = req.body;
    await sponsor.update({
      ...(name !== undefined && { name: String(name).trim() }),
      ...(url !== undefined && { url: String(url).trim() }),
      ...(description !== undefined && { description: description ? String(description).trim() : null }),
      ...(state !== undefined && { state: state || null }),
      ...(city !== undefined && { city: city ? String(city).trim() : null }),
      ...(start_date !== undefined && { start_date }),
      ...(end_date !== undefined && { end_date }),
      ...(is_active !== undefined && { is_active }),
    });
    res.json(sponsor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/sponsors/:id', async (req, res) => {
  try {
    const sponsor = await Sponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Patrocínio não encontrado' });
    await sponsor.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin UI ─────────────────────────────────────────────────────────────────

router.get('/admin/sponsors', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sponsors = await Sponsor.findAll({ order: [['created_at', 'DESC']] });
    const data = sponsors.map((s) => ({
      ...s.toJSON(),
      isActive: s.is_active && s.start_date <= today && s.end_date >= today,
    }));

    res.render('admin/layout', {
      title: 'Patrocínios',
      currentPage: 'sponsors',
      partial: 'sponsors',
      data,
      stats: { total: data.length, active: data.filter((s) => s.isActive).length },
      pagination: null,
    });
  } catch (err) {
    res.status(500).send('Erro ao carregar patrocínios: ' + err.message);
  }
});

router.get('/admin/sponsors/analytics', async (req, res) => {
  try {
    const sponsors = await Sponsor.findAll({ order: [['click_count', 'DESC']] });
    res.render('admin/layout', {
      title: 'Analytics — Patrocínios',
      currentPage: 'sponsors',
      partial: 'sponsors-analytics',
      data: sponsors.map((s) => s.toJSON()),
      stats: null,
      pagination: null,
    });
  } catch (err) {
    res.status(500).send('Erro ao carregar analytics: ' + err.message);
  }
});

module.exports = router;
