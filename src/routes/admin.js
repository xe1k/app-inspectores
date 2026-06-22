// Panel de administración (solo rol 'admin'). Gestión de usuarios e historial
// de actividad (inspecciones, firmas y hallazgos). Se monta en server.js con
// requireLogin + checkRol('admin'), así que aquí se asume que req.session.usuario
// existe y es admin.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const ROLES_VALIDOS = ['inspector', 'supervisor', 'gerencial', 'admin'];
const RE_PASSWORD_MIN = 6;

// Cuántos administradores activos quedan aparte del usuario indicado.
function otrosAdminsActivos(excluyeId) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?"
  ).get(excluyeId).n;
}

// ── Usuarios ───────────────────────────────────────────────────────────────

// GET /api/admin/usuarios -> todos los usuarios (sin hashes).
router.get('/usuarios', (req, res) => {
  const usuarios = db.prepare(
    `SELECT id, username, nombre, nombre_completo, rol, activo, creado_en
     FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE`
  ).all();
  res.json(usuarios);
});

// POST /api/admin/usuarios { username, nombre, password, rol }
router.post('/usuarios', (req, res) => {
  const username = (req.body?.username || '').trim();
  const nombre = (req.body?.nombre || '').trim();
  const password = String(req.body?.password ?? '');
  const rol = (req.body?.rol || 'inspector').trim();

  if (!username || !nombre) {
    return res.status(400).json({ error: 'Usuario y nombre son obligatorios' });
  }
  if (password.length < RE_PASSWORD_MIN) {
    return res.status(400).json({ error: `La clave debe tener al menos ${RE_PASSWORD_MIN} caracteres` });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ error: 'Rol no válido' });
  }

  const yaExiste = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
  if (yaExiste) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario' });
  }

  const info = db.prepare(
    `INSERT INTO usuarios (username, nombre, nombre_completo, password_hash, rol)
     VALUES (?, ?, ?, ?, ?)`
  ).run(username, nombre, nombre, bcrypt.hashSync(password, 10), rol);

  const creado = db.prepare(
    'SELECT id, username, nombre, nombre_completo, rol, activo, creado_en FROM usuarios WHERE id = ?'
  ).get(info.lastInsertRowid);
  res.status(201).json(creado);
});

// PUT /api/admin/usuarios/:id { nombre, rol, activo }
router.put('/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

  const nombre = req.body?.nombre !== undefined ? (req.body.nombre || '').trim() : usuario.nombre;
  const rol = req.body?.rol !== undefined ? (req.body.rol || '').trim() : usuario.rol;
  const activo = req.body?.activo !== undefined ? (req.body.activo ? 1 : 0) : usuario.activo;

  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  if (!ROLES_VALIDOS.includes(rol)) return res.status(400).json({ error: 'Rol no válido' });

  const esYoMismo = id === req.session.usuario.id;
  const dejaDeSerAdmin = usuario.rol === 'admin' && (rol !== 'admin' || activo === 0);

  // Anti-bloqueo: ni el propio admin ni el último admin pueden quedar fuera.
  if (dejaDeSerAdmin) {
    if (esYoMismo) {
      return res.status(400).json({ error: 'No puedes quitarte a ti mismo el rol de administrador ni desactivarte' });
    }
    if (otrosAdminsActivos(id) === 0) {
      return res.status(400).json({ error: 'Debe quedar al menos un administrador activo' });
    }
  }

  db.prepare('UPDATE usuarios SET nombre = ?, rol = ?, activo = ? WHERE id = ?')
    .run(nombre, rol, activo, id);

  const actualizado = db.prepare(
    'SELECT id, username, nombre, nombre_completo, rol, activo, creado_en FROM usuarios WHERE id = ?'
  ).get(id);
  res.json(actualizado);
});

// POST /api/admin/usuarios/:id/password { password }
router.post('/usuarios/:id/password', (req, res) => {
  const id = Number(req.params.id);
  const usuario = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

  const password = String(req.body?.password ?? '');
  if (password.length < RE_PASSWORD_MIN) {
    return res.status(400).json({ error: `La clave debe tener al menos ${RE_PASSWORD_MIN} caracteres` });
  }

  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  res.json({ ok: true });
});

// ── Historial (solo lectura) ────────────────────────────────────────────────

function limite(req) {
  const n = Number(req.query.limite);
  return Number.isFinite(n) && n > 0 && n <= 500 ? n : 100;
}

// GET /api/admin/historial/firmas -> firmas e invalidaciones (reaperturas).
router.get('/historial/firmas', (req, res) => {
  const filas = db.prepare(
    `SELECT a.id, a.accion, a.timestamp, a.motivo,
            i.equipo, i.ot,
            COALESCE(NULLIF(u.nombre_completo, ''), u.nombre) AS usuario
     FROM auditoria_firmas a
     JOIN inspecciones i ON i.id = a.inspeccion_id
     JOIN usuarios u ON u.id = a.usuario_id
     ORDER BY a.timestamp DESC
     LIMIT ?`
  ).all(limite(req));
  res.json(filas);
});

// GET /api/admin/historial/inspecciones -> inspecciones recientes.
router.get('/historial/inspecciones', (req, res) => {
  const filas = db.prepare(
    `SELECT i.id, i.equipo, i.ot, i.estado, i.firmada,
            i.fecha_inicio, i.fecha_cierre, i.fecha,
            p.modelo,
            COALESCE(NULLIF(u.nombre_completo, ''), u.nombre) AS inspector
     FROM inspecciones i
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     JOIN usuarios u ON u.id = i.inspector_id
     ORDER BY COALESCE(i.fecha_inicio, i.fecha) DESC, i.id DESC
     LIMIT ?`
  ).all(limite(req));
  res.json(filas);
});

// GET /api/admin/historial/hallazgos -> hallazgos recientes (foto del momento).
router.get('/historial/hallazgos', (req, res) => {
  const filas = db.prepare(
    `SELECT h.id, h.numero, h.criticidad, h.sistema, h.sector,
            COALESCE(h.fecha_creacion, h.creado_en) AS fecha,
            i.id AS inspeccion_id, i.equipo, p.modelo,
            COALESCE(NULLIF(u.nombre_completo, ''), u.nombre) AS inspector
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     JOIN usuarios u ON u.id = i.inspector_id
     ORDER BY COALESCE(h.fecha_creacion, h.creado_en) DESC, h.id DESC
     LIMIT ?`
  ).all(limite(req));
  res.json(filas);
});

module.exports = router;
