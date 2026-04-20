const express = require('express');
const { Op } = require('sequelize');
const { User } = require('../../models');
const {
  clearSessionCookie,
  createResetToken,
  createSessionToken,
  hashPassword,
  hashToken,
  sanitizeUser,
  setSessionCookie,
  verifyPassword,
} = require('../../services/auth.service');
const { sendPasswordResetEmail } = require('../../services/email.service');
const { attachUser, requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function userPayloadFromBody(body = {}) {
  return {
    name: String(body.name || '').trim(),
    email: normalizeEmail(body.email),
    phone: String(body.phone || '').trim() || null,
    region: String(body.region || '').trim() || null,
    interests: String(body.interests || '').trim() || null,
    smart_search: body.smartSearch !== false && body.smart_search !== false && body.smartSearch !== 'false',
    future_alerts: body.futureAlerts === true || body.future_alerts === true || body.futureAlerts === 'true',
    photo: String(body.photo || '').trim() || null,
  };
}

router.use(attachUser);

router.get('/me', (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

router.post('/register', async (req, res) => {
  try {
    const payload = userPayloadFromBody(req.body);
    const password = String(req.body.password || '');

    if (!payload.name || !payload.email || password.length < 6) {
      return res.status(400).json({ error: 'Informe nome, e-mail e uma senha com pelo menos 6 caracteres.' });
    }

    const existing = await User.findOne({ where: { email: payload.email } });
    if (existing) {
      return res.status(409).json({ error: 'Ja existe uma conta com esse e-mail.' });
    }

    const userCount = await User.count();
    const user = await User.create({
      ...payload,
      role: userCount === 0 ? 'admin' : 'user',
      password_hash: hashPassword(password),
    });

    const token = createSessionToken(user);
    setSessionCookie(res, token);
    return res.status(201).json({ user: sanitizeUser(user), token });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const user = await User.findOne({ where: { email } });

    if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'E-mail ou senha invalidos.' });
    }

    await user.update({ last_login_at: new Date() });
    const token = createSessionToken(user);
    setSessionCookie(res, token);
    return res.json({ user: sanitizeUser(user), token });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const payload = userPayloadFromBody({
      ...req.user.toJSON(),
      ...req.body,
    });

    if (!payload.name || !payload.email) {
      return res.status(400).json({ error: 'Nome e e-mail sao obrigatorios.' });
    }

    const existing = await User.findOne({
      where: { email: payload.email, id: { [Op.ne]: req.user.id } },
    });
    if (existing) {
      return res.status(409).json({ error: 'Ja existe outra conta com esse e-mail.' });
    }

    await req.user.update(payload);
    return res.json({ user: sanitizeUser(req.user) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/password/forgot', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({ where: { email } });

    if (!user || user.status !== 'active') {
      return res.json({ message: 'Se o e-mail existir, enviaremos as instrucoes de recuperacao.' });
    }

    const resetToken = createResetToken();
    await user.update({
      reset_token_hash: resetToken.hash,
      reset_token_expires_at: new Date(Date.now() + 60 * 60 * 1000),
    });

    const result = await sendPasswordResetEmail(user, resetToken.token);
    return res.json({
      message: result.sent
        ? 'Enviamos as instrucoes de recuperacao para o e-mail informado.'
        : 'Token de recuperacao gerado. Configure o SMTP para envio automatico.',
      resetLink: result.sent ? undefined : result.resetLink,
      emailSent: result.sent,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/password/reset', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');

    if (!token || password.length < 6) {
      return res.status(400).json({ error: 'Token e nova senha com pelo menos 6 caracteres sao obrigatorios.' });
    }

    const user = await User.findOne({
      where: {
        reset_token_hash: hashToken(token),
        reset_token_expires_at: { [Op.gt]: new Date() },
        status: 'active',
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Token invalido ou expirado.' });
    }

    await user.update({
      password_hash: hashPassword(password),
      reset_token_hash: null,
      reset_token_expires_at: null,
    });

    return res.json({ message: 'Senha atualizada. Voce ja pode entrar.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
