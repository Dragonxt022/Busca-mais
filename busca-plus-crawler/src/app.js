const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { logger } = require('./libs/logger');
const sourceRoutes = require('./api/routes/source.routes');
const pageRoutes = require('./api/routes/page.routes');
const adminApiRoutes = require('./api/routes/admin/stats.routes');
const adminRoutes = require('./api/routes/admin/index');
const schedulerRoutes = require('./api/routes/scheduler.routes');
const { errorHandler, notFoundHandler } = require('./api/middlewares/error.middleware');

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
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

app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));
app.use('/images', express.static(path.join(__dirname, '../images')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/api/sources', sourceRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/admin', adminApiRoutes);

app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;