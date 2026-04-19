const express = require('express');
const { Op } = require('sequelize');
const multer = require('multer');
const { Sponsor } = require('../../models');
const brazilCitiesService = require('../../services/brazil-cities.service');
const {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_COUNT,
  deleteManagedSponsorImages,
  parseStoredSponsorImages,
  resolveSponsorImages,
  serializeStoredSponsorImages,
} = require('../../services/sponsor-image.service');

const router = express.Router();
const VALID_UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const DEFAULT_PUBLIC_SPONSOR_LIMIT = 100;
const MAX_PUBLIC_SPONSOR_LIMIT = 250;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_IMAGE_COUNT,
  },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new Error('Formato de imagem invalido. Use JPG, PNG ou WEBP.'));
  },
});

function getScopeRank(sponsor, state, city) {
  if (state && city && sponsor.state === state && sponsor.city === city) return 3;
  if (state && sponsor.state === state && !sponsor.city) return 2;
  if (!sponsor.state && !sponsor.city) return 1;
  return 0;
}

function normalizeSponsorPayload(body = {}) {
  const name = String(body.name || '').trim();
  const url = String(body.url || '').trim();
  const description = String(body.description || '').trim();
  const state = String(body.state || '').trim().toUpperCase();
  const city = String(body.city || '').trim();
  const startDate = String(body.start_date || '').trim();
  const endDate = String(body.end_date || '').trim();
  if (!name || !url || !startDate || !endDate) {
    return { error: 'Campos obrigatorios: name, url, start_date, end_date' };
  }

  try {
    new URL(url);
  } catch (_) {
    return { error: 'URL invalida' };
  }

  if (Number.isNaN(Date.parse(startDate)) || Number.isNaN(Date.parse(endDate))) {
    return { error: 'Datas invalidas' };
  }

  if (new Date(startDate) > new Date(endDate)) {
    return { error: 'A data de inicio nao pode ser maior que a data de fim' };
  }

  if (state && !VALID_UF.includes(state)) {
    return { error: 'Estado invalido' };
  }

  return {
    payload: {
      name,
      url,
      description: description || null,
      state: state || null,
      city: city || null,
      start_date: startDate,
      end_date: endDate,
      is_active: body.is_active === true || body.is_active === 'true' || body.is_active === 1 || body.is_active === '1',
    },
  };
}

function parseRetainedImages(raw) {
  if (!raw) return [];

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapSponsorForApi(sponsor, state, city) {
  const payload = sponsor.toJSON ? sponsor.toJSON() : sponsor;

  return {
    ...payload,
    images: parseStoredSponsorImages(payload.images).map((image) => image.url),
    imageAssets: parseStoredSponsorImages(payload.images),
    scopeRank: getScopeRank(payload, state, city),
  };
}

function mapSponsorForAdmin(sponsor, today) {
  const payload = sponsor.toJSON ? sponsor.toJSON() : sponsor;

  return {
    ...payload,
    isActive: payload.is_active && payload.start_date <= today && payload.end_date >= today,
    images: parseStoredSponsorImages(payload.images),
  };
}

async function applySponsorImages({ sponsor = null, body = {}, files = [] }) {
  const previousImages = parseStoredSponsorImages(sponsor?.images);
  const retainedImages = parseRetainedImages(body.existing_images);
  const nextImages = await resolveSponsorImages({
    sponsorId: sponsor?.id || null,
    sponsorName: body.name || sponsor?.name || '',
    existingImages: retainedImages,
    files,
  });

  const removedImages = previousImages.filter((previousImage) => (
    !nextImages.some((nextImage) => nextImage.url === previousImage.url && nextImage.thumbnailUrl === previousImage.thumbnailUrl)
  ));

  await deleteManagedSponsorImages(removedImages);
  return nextImages;
}

function handleUploadErrors(error, _req, res, next) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'Imagem excede o limite de 5MB.' });
      return;
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      res.status(400).json({ error: `Limite maximo de ${MAX_IMAGE_COUNT} imagens por patrocinio.` });
      return;
    }
  }

  if (error) {
    res.status(400).json({ error: error.message || 'Falha ao processar upload das imagens.' });
    return;
  }

  next();
}

router.get('/api/sponsors', async (req, res) => {
  try {
    const { state, city } = req.query;
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_PUBLIC_SPONSOR_LIMIT)
      : DEFAULT_PUBLIC_SPONSOR_LIMIT;
    const today = new Date().toISOString().slice(0, 10);

    const where = {
      is_active: true,
      start_date: { [Op.lte]: today },
      end_date: { [Op.gte]: today },
    };

    if (state || city) {
      where[Op.or] = [{ state: null, city: null }];
      if (state) where[Op.or].push({ state, city: null });
      if (state && city) where[Op.or].push({ state, city });
    }

    const sponsors = await Sponsor.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
    });

    const payload = sponsors
      .map((s) => {
        const sponsor = s.toJSON();

        return {
          ...sponsor,
          ...mapSponsorForApi(sponsor, state, city),
        };
      })
      .sort((left, right) => {
        if (right.scopeRank !== left.scopeRank) return right.scopeRank - left.scopeRank;
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.get('/api/cities', async (req, res) => {
  try {
    const { state } = req.query;
    const cities = await brazilCitiesService.getCitiesByState(state);
    res.json(cities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/sponsors', upload.array('images', MAX_IMAGE_COUNT), handleUploadErrors, async (req, res) => {
  try {
    const { payload, error } = normalizeSponsorPayload(req.body);
    if (error) {
      return res.status(400).json({ error });
    }

    const imageAssets = await resolveSponsorImages({
      sponsorName: payload.name,
      existingImages: parseRetainedImages(req.body.existing_images),
      files: req.files,
    });

    const sponsor = await Sponsor.create({
      ...payload,
      images: imageAssets.length > 0 ? serializeStoredSponsorImages(imageAssets) : null,
    });
    res.status(201).json(mapSponsorForAdmin(sponsor, new Date().toISOString().slice(0, 10)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/admin/sponsors/:id', upload.array('images', MAX_IMAGE_COUNT), handleUploadErrors, async (req, res) => {
  try {
    const sponsor = await Sponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Patrocinio nao encontrado' });

    const { payload, error } = normalizeSponsorPayload({
      ...sponsor.toJSON(),
      ...req.body,
    });
    if (error) {
      return res.status(400).json({ error });
    }

    const imageAssets = await applySponsorImages({
      sponsor,
      body: req.body,
      files: req.files,
    });

    await sponsor.update({
      ...payload,
      images: imageAssets.length > 0 ? serializeStoredSponsorImages(imageAssets) : null,
    });
    res.json(mapSponsorForAdmin(sponsor, new Date().toISOString().slice(0, 10)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/sponsors/:id', async (req, res) => {
  try {
    const sponsor = await Sponsor.findByPk(req.params.id);
    if (!sponsor) return res.status(404).json({ error: 'Patrocinio nao encontrado' });
    await deleteManagedSponsorImages(parseStoredSponsorImages(sponsor.images));
    await sponsor.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/sponsors', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sponsors = await Sponsor.findAll({ order: [['created_at', 'DESC']] });
    const data = sponsors.map((s) => mapSponsorForAdmin(s, today));

    res.render('admin/layout', {
      title: 'Patrocinios',
      currentPage: 'sponsors',
      partial: 'sponsors',
      data,
      stats: { total: data.length, active: data.filter((s) => s.isActive).length },
      pagination: null,
    });
  } catch (err) {
    res.status(500).send('Erro ao carregar patrocinios: ' + err.message);
  }
});

router.get('/admin/sponsors/analytics', async (req, res) => {
  try {
    const sponsors = await Sponsor.findAll({ order: [['click_count', 'DESC']] });
    res.render('admin/layout', {
      title: 'Analytics - Patrocinios',
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
