const emailSettingsService = require('./email-settings.service');

function loadNodemailer() {
  try {
    return require('nodemailer');
  } catch {
    return null;
  }
}

function buildResetLink(token, appUrl) {
  return `${String(appUrl || 'http://localhost:3000').replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetEmail(user, token) {
  const settings = emailSettingsService.getSettings();
  const resetLink = buildResetLink(token, settings.appUrl);
  const nodemailer = loadNodemailer();

  if (!settings.enabled || !settings.host || !settings.fromEmail || !nodemailer) {
    return {
      sent: false,
      resetLink,
      reason: !nodemailer ? 'nodemailer_not_installed' : 'email_not_configured',
    };
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: settings.user ? {
      user: settings.user,
      pass: settings.password,
    } : undefined,
  });

  await transporter.sendMail({
    from: `"${settings.fromName}" <${settings.fromEmail}>`,
    to: user.email,
    subject: 'Recuperacao de senha - Busca+',
    text: [
      `Ola, ${user.name}.`,
      '',
      'Use o link abaixo para redefinir sua senha:',
      resetLink,
      '',
      'Se voce nao solicitou a recuperacao, ignore esta mensagem.',
    ].join('\n'),
    html: `
      <p>Ola, ${user.name}.</p>
      <p>Use o link abaixo para redefinir sua senha:</p>
      <p><a href="${resetLink}">${resetLink}</a></p>
      <p>Se voce nao solicitou a recuperacao, ignore esta mensagem.</p>
    `,
  });

  return { sent: true, resetLink };
}

module.exports = {
  buildResetLink,
  sendPasswordResetEmail,
};
