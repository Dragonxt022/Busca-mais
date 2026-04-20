const { User } = require('../../models');
const {
  clearSessionCookie,
  getTokenFromRequest,
  sanitizeUser,
  verifySessionToken,
} = require('../../services/auth.service');

async function attachUser(req, _res, next) {
  try {
    const payload = verifySessionToken(getTokenFromRequest(req));
    if (!payload?.sub) {
      req.user = null;
      return next();
    }

    const user = await User.findByPk(payload.sub);
    req.user = user && user.status === 'active' ? user : null;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, res, next) {
  if (req.user) {
    return next();
  }

  if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Autenticacao obrigatoria.' });
  }

  clearSessionCookie(res);
  return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || '/admin')}`);
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) {
    return res.status(req.user ? 403 : 401).json({ error: 'Acesso administrativo obrigatorio.' });
  }

  clearSessionCookie(res);
  return res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || '/admin')}`);
}

function exposeUserLocals(req, res, next) {
  res.locals.currentUser = sanitizeUser(req.user);
  next();
}

module.exports = {
  attachUser,
  exposeUserLocals,
  requireAdmin,
  requireAuth,
};
