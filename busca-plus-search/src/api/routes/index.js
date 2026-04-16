const express = require('express');

const searchRoutes = require('./search.routes');

const router = express.Router();

router.use('/', searchRoutes);

module.exports = router;
