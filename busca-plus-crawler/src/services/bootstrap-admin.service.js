const { User } = require('../models');
const { hashPassword } = require('./auth.service');

async function ensureDefaultAdmin() {
  const adminCount = await User.count({ where: { role: 'admin' } });
  if (adminCount > 0) {
    return null;
  }

  const email = String(process.env.ADMIN_EMAIL || 'admin@buscaplus.local').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || 'admin123');
  const name = String(process.env.ADMIN_NAME || 'Administrador');

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    await existing.update({ role: 'admin', status: 'active' });
    return { email, created: false };
  }

  await User.create({
    name,
    email,
    role: 'admin',
    status: 'active',
    password_hash: hashPassword(password),
  });

  return { email, created: true };
}

module.exports = {
  ensureDefaultAdmin,
};
