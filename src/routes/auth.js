// Rutas de autenticación: login, logout y datos del usuario en sesión.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// POST /api/auth/login  { username, password }
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan usuario o clave' });
  }

  const u = db.prepare('SELECT * FROM usuarios WHERE username = ? AND activo = 1').get(username);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({ error: 'Usuario o clave incorrectos' });
  }

  // Guardar en sesión solo lo necesario (nunca el hash).
  req.session.usuario = { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol || 'inspector' };

  res.json({ usuario: req.session.usuario });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/me  -> usuario actual (o 401)
router.get('/me', (req, res) => {
  if (req.session && req.session.usuario) {
    // Releer el rol desde la base: cubre sesiones creadas antes de que
    // existiera la columna y cambios de rol sin necesidad de re-login.
    const u = db.prepare('SELECT rol FROM usuarios WHERE id = ? AND activo = 1').get(req.session.usuario.id);
    if (u) {
      req.session.usuario.rol = u.rol || 'inspector';
      return res.json({ usuario: req.session.usuario });
    }
  }
  res.status(401).json({ error: 'No autenticado' });
});

module.exports = router;
