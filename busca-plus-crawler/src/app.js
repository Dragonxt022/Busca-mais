const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { logger } = require('./libs/logger');
const sourceRoutes = require('./api/routes/source.routes');
const pageRoutes = require('./api/routes/page.routes');
const jobRoutes = require('./api/routes/job.routes');
const adminApiRoutes = require('./api/routes/admin/stats.routes');
const adminRoutes = require('./api/routes/admin/index');
const schedulerRoutes = require('./api/routes/scheduler.routes');
const adminCatalogRoutes = require('./modules/transparency/routes/admin-catalog-routes');

const { errorHandler, notFoundHandler } = require('./api/middlewares/error.middleware');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Liberar CORS para imagens
app.use('/images', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, '../images')));

app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/api/sources', sourceRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/admin', adminApiRoutes);

app.use('/admin/catalog', adminCatalogRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;