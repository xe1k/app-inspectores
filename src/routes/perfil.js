// Perfil del usuario en sesión: identidad para la firma de informes
// (nombre completo, RUT, cargo), firma manuscrita y PIN de confirmación.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

// PNG base64 de un canvas de firma; 500 KB es muchísimo más de lo necesario.
const PREFIJO_PNG = 'data:image/png;base64,';
const MAX_FIRMA_BYTES = 500 * 1024;

const RE_RUT = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/;
const RE_PIN = /^\d{4}$/;

function perfilActual(usuarioId) {
  const u = db.prepare(
    `SELECT id, username, nombre, nombre_completo, rut, cargo, firma_imagen, pin_hash
     FROM usuarios WHERE id = ?`
  ).get(usuarioId);
  if (!u) return null;
  return {
    username: u.username,
    nombre_completo: (u.nombre_completo || '').trim() || u.nombre,
    rut: u.rut,
    cargo: u.cargo,
    firma_imagen: u.firma_imagen,
    tiene_pin: !!u.pin_hash
  };
}

// GET /api/perfil -> datos del usuario en sesión (nunca incluye hashes)
router.get('/', (req, res) => {
  const perfil = perfilActual(req.session.usuario.id);
  if (!perfil) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(perfil);
});

// PUT /api/perfil { nombre_completo, rut, cargo }
router.put('/', (req, res) => {
  const { nombre_completo, rut, cargo } = req.body || {};
  const nombre = (nombre_completo || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre completo es obligatorio' });

  const rutLimpio = (rut || '').trim();
  if (rutLimpio && !RE_RUT.test(rutLimpio)) {
    return res.status(400).json({ error: 'El RUT debe tener el formato 12.345.678-9 (con puntos y guion)' });
  }

  // "nombre" (el que se muestra en la app y los PDF antiguos) se mantiene
  // sincronizado con el nombre completo para no tener dos identidades.
  db.prepare(
    'UPDATE usuarios SET nombre_completo = ?, nombre = ?, rut = ?, cargo = ? WHERE id = ?'
  ).run(nombre, nombre, rutLimpio || null, (cargo || '').trim() || null, req.session.usuario.id);
  req.session.usuario.nombre = nombre;

  res.json(perfilActual(req.session.usuario.id));
});

// PUT /api/perfil/firma { firma_imagen } -> guarda la firma manuscrita (PNG base64)
router.put('/firma', (req, res) => {
  const { firma_imagen } = req.body || {};
  if (typeof firma_imagen !== 'string' || !firma_imagen.startsWith(PREFIJO_PNG)) {
    return res.status(400).json({ error: 'La firma debe ser una imagen PNG dibujada en el recuadro' });
  }
  if (firma_imagen.length > MAX_FIRMA_BYTES) {
    return res.status(400).json({ error: 'La imagen de la firma es demasiado grande' });
  }
  // Validar que el base64 decodifica a un PNG real (firma de 8 bytes).
  const png = Buffer.from(firma_imagen.slice(PREFIJO_PNG.length), 'base64');
  if (png.length < 8 || png.readUInt32BE(0) !== 0x89504e47) {
    return res.status(400).json({ error: 'La imagen de la firma no es un PNG válido' });
  }

  db.prepare('UPDATE usuarios SET firma_imagen = ? WHERE id = ?').run(firma_imagen, req.session.usuario.id);
  res.json({ ok: true });
});

// DELETE /api/perfil/firma -> quita la firma manuscrita (es opcional)
router.delete('/firma', (req, res) => {
  db.prepare('UPDATE usuarios SET firma_imagen = NULL WHERE id = ?').run(req.session.usuario.id);
  res.json({ ok: true });
});

// PUT /api/perfil/pin { pin, pin_confirmacion } -> configura el PIN de firma.
// El PIN viaja solo aquí y en /firmar; nunca se guarda ni se loguea en claro.
router.put('/pin', (req, res) => {
  const { pin, pin_confirmacion } = req.body || {};
  if (!RE_PIN.test(String(pin ?? ''))) {
    return res.status(400).json({ error: 'El PIN debe tener exactamente 4 dígitos' });
  }
  if (String(pin) !== String(pin_confirmacion ?? '')) {
    return res.status(400).json({ error: 'Los dos PIN ingresados no coinciden' });
  }

  db.prepare('UPDATE usuarios SET pin_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(String(pin), 10), req.session.usuario.id);
  res.json({ ok: true, tiene_pin: true });
});

module.exports = router;
