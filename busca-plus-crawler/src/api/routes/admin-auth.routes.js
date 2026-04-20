const express = require('express');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('admin/login', {
    title: 'Entrar',
    nextUrl: req.query.next || '/admin',
  });
});

module.exports = router;
