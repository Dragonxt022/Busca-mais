const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { logger } = require('./libs/logger');
const aiSettingsApiRoutes = require('./api/routes/admin/ai-settings.routes');
const emailSettingsApiRoutes = require('./api/routes/admin/email-settings.routes');
const authRoutes = require('./api/routes/auth.routes');
const searchLogRoutes = require('./api/routes/search-log.routes');
const adminAuthRoutes = require('./api/routes/admin-auth.routes');
const publicSettingsRoutes = require('./api/routes/public-settings.routes');
const adminRoutes = require('./api/routes/admin/index');
const jobRoutes = require('./api/routes/job.routes');
const sponsorRoutes = require('./api/routes/sponsor.routes');
const aiRoutes = require('./api/routes/ai.routes');
const engineRoutes = require('./modules/engine/routes/engine.routes');
const { attachUser, exposeUserLocals, requireAdmin } = require('./api/middlewares/auth.middleware');

const { errorHandler, notFoundHandler } = require('./api/middlewares/error.middleware');

const app = express();
app.locals.logger = logger;
const BODY_LIMIT = process.env.ADMIN_BODY_LIMIT || '200mb';

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

// Liberar CORS para imagens
app.use('/images', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../images')));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/api/auth', authRoutes);
app.use('/api/search-logs', searchLogRoutes);
app.use('/api/public', publicSettingsRoutes);
app.use('/api/ai', aiRoutes);

app.use(attachUser);
app.use(exposeUserLocals);
app.use('/admin', adminAuthRoutes);

app.use('/api/admin', requireAdmin);
app.use('/api/admin', aiSettingsApiRoutes);
app.use('/api/admin', emailSettingsApiRoutes);
app.use('/api/admin/engine', requireAdmin, engineRoutes);
app.use('/api/jobs', requireAdmin, jobRoutes);

app.use('/admin', requireAdmin);
app.use('/', sponsorRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
