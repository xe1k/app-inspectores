// Hallazgos (registros de inspección): el corazón del informe.
// Cada uno es un daño encontrado, con su descripción, criticidad, fotos
// propias y marcas sobre los diagramas de referencia de la plantilla.
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { checkRol } = require('../middleware/auth');

const router = express.Router();

// Las fotos viven en disco, en data/inspecciones/<inspeccion_id>/<hallazgo_id>/
const BASE = path.join(__dirname, '..', '..', 'data', 'inspecciones');
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });

const EXT_OK = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function carpetaHallazgo(inspeccionId, hallazgoId) {
  return path.join(BASE, String(inspeccionId), String(hallazgoId));
}

function rutaArchivo(carpetaAbs, nombre) {
  if (!nombre || typeof nombre !== 'string') return null;
  const limpio = path.basename(nombre);
  if (limpio !== nombre) return null;
  const abs = path.join(carpetaAbs, limpio);
  if (path.dirname(abs) !== carpetaAbs) return null;
  return abs;
}

function nombreLibre(carpetaAbs, original) {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, path.extname(original)).replace(/[^\w.-]+/g, '_') || 'foto';
  let candidato = `${base}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(carpetaAbs, candidato))) {
    candidato = `${base}_${n}${ext}`;
    n++;
  }
  return candidato;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const abs = carpetaHallazgo(req._hallazgo.inspeccion_id, req._hallazgo.id);
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
    req._carpetaAbs = abs;
    cb(null, abs);
  },
  filename(req, file, cb) {
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, nombreLibre(req._carpetaAbs, original));
  }
});

const subir = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },   // 12 MB por foto
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (EXT_OK.has(ext)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (.jpg, .png, .webp)'));
  }
});

// Carga el hallazgo SOLO si pertenece a una inspección del inspector en sesión.
function cargarHallazgo(req, res, next) {
  const h = db.prepare(
    `SELECT h.*, i.inspector_id, i.estado AS inspeccion_estado, i.plantilla_id
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     WHERE h.id = ?`
  ).get(req.params.id);
  if (!h || h.inspector_id !== req.session.usuario.id) return res.status(404).json({ error: 'Hallazgo no encontrado' });
  req._hallazgo = h;
  next();
}

// gerencial y admin tienen visibilidad de seguimiento (solo lectura).
function puedeVerSeguimiento(req) {
  const rol = req.session.usuario.rol;
  return rol === 'gerencial' || rol === 'admin' || rol === 'supervisor';
}

// Igual que cargarHallazgo, pero supervisores/gerencial/admin pueden acceder
// a hallazgos de cualquier inspector (necesario para la vista de seguimiento).
function cargarHallazgoSeguimiento(req, res, next) {
  const h = db.prepare(
    `SELECT h.*, i.inspector_id, i.estado AS inspeccion_estado, i.plantilla_id
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     WHERE h.id = ?`
  ).get(req.params.id);
  if (!h || (h.inspector_id !== req.session.usuario.id && !puedeVerSeguimiento(req))) {
    return res.status(404).json({ error: 'Hallazgo no encontrado' });
  }
  req._hallazgo = h;
  next();
}

function obtenerHallazgo(id) {
  const h = db.prepare('SELECT * FROM hallazgos WHERE id = ?').get(id);
  if (!h) return null;
  const fotos = db.prepare('SELECT id, archivo, orden FROM hallazgo_fotos WHERE hallazgo_id = ? ORDER BY orden, id').all(id);
  const marcas = db.prepare('SELECT id, diagrama_id, x_pct, y_pct FROM hallazgo_marcas_diagrama WHERE hallazgo_id = ?').all(id);
  // Si es revisión de un hallazgo anterior, incluir las fotos del origen para mostrarlas como referencia
  let fotos_anteriores = [];
  if (h.hallazgo_origen_id) {
    fotos_anteriores = db.prepare(
      'SELECT id, archivo, orden FROM hallazgo_fotos WHERE hallazgo_id = ? ORDER BY orden, id'
    ).all(h.hallazgo_origen_id);
  }
  return { ...h, fotos, marcas, fotos_anteriores };
}

const CRITICIDADES = new Set(['alta', 'media', 'baja']);
const PREEXISTENCIAS = new Set(['si', 'no', 'na']);
const ESTADOS_REVISION = new Set(['persiste', 'resuelto', 'nuevo']);

// zona_id es opcional; si viene, debe ser una zona de la plantilla de la
// inspección. Devuelve { ok, valor } o { ok: false } si la zona no calza.
function validarZona(body, plantillaId, valorPrevio = null) {
  if (body.zona_id === undefined) return { ok: true, valor: valorPrevio };
  if (body.zona_id === null || body.zona_id === '') return { ok: true, valor: null };
  const id = Number(body.zona_id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false };
  const zona = db.prepare('SELECT id FROM zonas WHERE id = ? AND plantilla_id = ?').get(id, plantillaId);
  return zona ? { ok: true, valor: zona.id } : { ok: false };
}

function leerCampos(body, valoresPrevios = {}) {
  const campo = (clave) => {
    const v = body[clave];
    if (v == null) return valoresPrevios[clave] ?? null;
    const s = String(v).trim();
    return s || null;
  };
  // tiempo_reparacion SIEMPRE en horas; recursos SIEMPRE cantidad de
  // personas. Se guardan como entero (o null); los datos históricos pueden
  // ser texto ("12 hrs") y los tolera src/utils/formatHallazgo.js al leer.
  const entero = (clave, max) => {
    const v = body[clave];
    if (v === undefined) return valoresPrevios[clave] ?? null;
    if (v === null || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  };
  return {
    sistema: campo('sistema'),
    sector: campo('sector'),
    codigo: campo('codigo'),
    tipo_dano: campo('tipo_dano'),
    descripcion_dano: campo('descripcion_dano'),
    trabajo_realizar: campo('trabajo_realizar'),
    recomendacion: campo('recomendacion'),
    tiempo_reparacion: entero('tiempo_reparacion', 999), // horas (0-999)
    recursos: entero('recursos', 99),                    // personas (0-99)
  };
}

// ---------- HALLAZGOS ----------

// GET /api/hallazgos?inspeccion_id=N -> lista de hallazgos de una inspección propia
router.get('/', (req, res) => {
  const inspeccionId = Number(req.query.inspeccion_id);
  if (!inspeccionId) return res.status(400).json({ error: 'Falta inspeccion_id' });
  const insp = db.prepare('SELECT id FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(inspeccionId, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  const filas = db.prepare(
    'SELECT * FROM hallazgos WHERE inspeccion_id = ? ORDER BY numero'
  ).all(insp.id).map(h => obtenerHallazgo(h.id));
  res.json(filas);
});

// ---------- CICLO DE VIDA ----------

const ESTADOS_CICLO = ['detectado', 'en_reparacion', 'resuelto', 'verificado'];
// Transición permitida: al siguiente paso del ciclo, o reabrir a 'detectado'.
function transicionValida(desde, hacia) {
  if (hacia === 'detectado') return desde !== 'detectado';
  return ESTADOS_CICLO.indexOf(hacia) === ESTADOS_CICLO.indexOf(desde) + 1;
}

// GET /api/hallazgos/abiertos -> todos los hallazgos no verificados de todas
// las inspecciones (solo gerencial/admin; alimenta la vista /seguimiento).
router.get('/abiertos', checkRol('gerencial', 'admin'), (req, res) => {
  res.json(db.prepare(
    `SELECT h.id, h.inspeccion_id, h.numero, h.criticidad, h.estado, h.tipo_dano,
            h.sistema, h.sector, h.codigo, h.fecha_estado_cambio, h.creado_en,
            h.tiempo_reparacion, h.recursos,
            i.equipo, i.ot, u.nombre AS inspector
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     JOIN usuarios u ON u.id = i.inspector_id
     WHERE h.estado != 'verificado'
     ORDER BY CASE h.criticidad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
              CASE h.estado WHEN 'detectado' THEN 0 WHEN 'en_reparacion' THEN 1 ELSE 2 END,
              h.creado_en`
  ).all());
});

// GET /api/hallazgos/:id -> detalle con fotos y marcas
router.get('/:id', cargarHallazgo, (req, res) => {
  res.json(obtenerHallazgo(req._hallazgo.id));
});

// PATCH /api/hallazgos/:id/estado -> avanza el ciclo de vida y deja auditoría.
// El usuario sale SIEMPRE de la sesión (no del body). Supervisores pueden
// cambiar el estado de hallazgos de cualquier inspector.
router.patch('/:id/estado', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgoSeguimiento, (req, res) => {
  const { estado, comentario } = req.body || {};
  if (!ESTADOS_CICLO.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }
  const actual = req._hallazgo.estado || 'detectado';
  if (estado === actual) return res.status(400).json({ error: 'El hallazgo ya está en ese estado' });
  if (!transicionValida(actual, estado)) {
    return res.status(400).json({ error: `No se puede pasar de "${actual}" a "${estado}"` });
  }

  const usuario = req.session.usuario.nombre;
  const fecha = new Date().toISOString();
  const nota = comentario != null ? (String(comentario).trim() || null) : null;

  db.transaction(() => {
    db.prepare(
      'UPDATE hallazgos SET estado = ?, fecha_estado_cambio = ?, usuario_estado = ? WHERE id = ?'
    ).run(estado, fecha, usuario, req._hallazgo.id);
    db.prepare(
      `INSERT INTO historial_hallazgo (hallazgo_id, estado_anterior, estado_nuevo, usuario, comentario, fecha)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req._hallazgo.id, actual, estado, usuario, nota, fecha);
  })();

  res.json(obtenerHallazgo(req._hallazgo.id));
});

// GET /api/hallazgos/:id/historial -> auditoría de cambios de estado
router.get('/:id/historial', cargarHallazgoSeguimiento, (req, res) => {
  res.json(db.prepare(
    'SELECT id, estado_anterior, estado_nuevo, usuario, comentario, fecha FROM historial_hallazgo WHERE hallazgo_id = ? ORDER BY fecha DESC, id DESC'
  ).all(req._hallazgo.id));
});

// POST /api/hallazgos -> crea un nuevo hallazgo dentro de una inspección propia
router.post('/', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const inspeccionId = Number(req.body && req.body.inspeccion_id);
  if (!inspeccionId) return res.status(400).json({ error: 'Falta inspeccion_id' });
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(inspeccionId, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (insp.estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden agregar hallazgos' });

  const { criticidad, preexistencia, estado_revision } = req.body || {};
  if (!CRITICIDADES.has(criticidad)) return res.status(400).json({ error: 'Selecciona una criticidad válida (alta, media o baja)' });
  const preex = PREEXISTENCIAS.has(preexistencia) ? preexistencia : null;
  const estadoRev = ESTADOS_REVISION.has(estado_revision) ? estado_revision : null;
  const zona = validarZona(req.body || {}, insp.plantilla_id);
  if (!zona.ok) return res.status(400).json({ error: 'La zona indicada no pertenece a la plantilla de esta inspección' });

  const campos = leerCampos(req.body || {});
  const numero = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 AS sig FROM hallazgos WHERE inspeccion_id = ?').get(inspeccionId).sig;

  const ahora = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO hallazgos
       (inspeccion_id, numero, sistema, sector, codigo, criticidad, tipo_dano, zona_id,
        descripcion_dano, trabajo_realizar, recomendacion, tiempo_reparacion, recursos, preexistencia, estado_revision,
        fecha_creacion, fecha_actualizacion)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(inspeccionId, numero, campos.sistema, campos.sector, campos.codigo, criticidad, campos.tipo_dano, zona.valor,
        campos.descripcion_dano, campos.trabajo_realizar, campos.recomendacion, campos.tiempo_reparacion, campos.recursos, preex, estadoRev,
        ahora, ahora);

  res.status(201).json(obtenerHallazgo(info.lastInsertRowid));
});

// PUT /api/hallazgos/:id -> edita un hallazgo propio
router.put('/:id', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  const h = req._hallazgo;
  if (h.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden editar sus hallazgos' });
  const { criticidad, preexistencia, estado_revision, nota_revision } = req.body || {};
  const nuevaCriticidad = criticidad != null ? criticidad : h.criticidad;
  if (!CRITICIDADES.has(nuevaCriticidad)) return res.status(400).json({ error: 'Selecciona una criticidad válida (alta, media o baja)' });
  const nuevaPreex = preexistencia != null ? (PREEXISTENCIAS.has(preexistencia) ? preexistencia : null) : h.preexistencia;
  const nuevoEstadoRev = estado_revision != null ? (ESTADOS_REVISION.has(estado_revision) ? estado_revision : null) : h.estado_revision;
  const nuevaNota = nota_revision !== undefined ? (String(nota_revision).trim() || null) : h.nota_revision;
  const zona = validarZona(req.body || {}, h.plantilla_id, h.zona_id);
  if (!zona.ok) return res.status(400).json({ error: 'La zona indicada no pertenece a la plantilla de esta inspección' });

  const campos = leerCampos(req.body || {}, h);

  db.prepare(
    `UPDATE hallazgos SET sistema = ?, sector = ?, codigo = ?, criticidad = ?, tipo_dano = ?, zona_id = ?,
       descripcion_dano = ?, trabajo_realizar = ?, recomendacion = ?, tiempo_reparacion = ?,
       recursos = ?, preexistencia = ?, estado_revision = ?, nota_revision = ?, fecha_actualizacion = ?
     WHERE id = ?`
  ).run(campos.sistema, campos.sector, campos.codigo, nuevaCriticidad, campos.tipo_dano, zona.valor,
        campos.descripcion_dano, campos.trabajo_realizar, campos.recomendacion, campos.tiempo_reparacion,
        campos.recursos, nuevaPreex, nuevoEstadoRev, nuevaNota, new Date().toISOString(), h.id);

  res.json(obtenerHallazgo(h.id));
});

// DELETE /api/hallazgos/:id -> elimina el hallazgo, sus fotos y marcas
router.delete('/:id', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  const h = req._hallazgo;
  if (h.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden eliminar sus hallazgos' });
  db.prepare('DELETE FROM hallazgos WHERE id = ?').run(h.id); // cascada: fotos y marcas
  const carpeta = carpetaHallazgo(h.inspeccion_id, h.id);
  if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- FOTOS ----------

// POST /api/hallazgos/:id/fotos -> sube una foto (campo "foto")
router.post('/:id/fotos', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  if (req._hallazgo.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden agregar fotos' });
  subir.single('foto')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto' });
    const sig = db.prepare(
      'SELECT COALESCE(MAX(orden), -1) + 1 AS sig FROM hallazgo_fotos WHERE hallazgo_id = ?'
    ).get(req._hallazgo.id).sig;
    const info = db.prepare(
      'INSERT INTO hallazgo_fotos (hallazgo_id, archivo, orden) VALUES (?, ?, ?)'
    ).run(req._hallazgo.id, req.file.filename, sig);
    res.status(201).json(db.prepare('SELECT id, archivo, orden FROM hallazgo_fotos WHERE id = ?').get(info.lastInsertRowid));
  });
});

// GET /api/hallazgos/:id/fotos/:fotoId/imagen -> sirve el archivo de la foto
router.get('/:id/fotos/:fotoId/imagen', cargarHallazgo, (req, res) => {
  const f = db.prepare('SELECT * FROM hallazgo_fotos WHERE id = ? AND hallazgo_id = ?').get(req.params.fotoId, req._hallazgo.id);
  if (!f) return res.status(404).end();
  const abs = rutaArchivo(carpetaHallazgo(req._hallazgo.inspeccion_id, req._hallazgo.id), f.archivo);
  if (!abs || !fs.existsSync(abs)) return res.status(404).end();
  res.sendFile(abs);
});

// PUT /api/hallazgos/:id/fotos/:fotoId -> reemplaza la imagen (foto anotada en el editor)
router.put('/:id/fotos/:fotoId', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  if (req._hallazgo.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden modificar fotos' });
  const f = db.prepare('SELECT * FROM hallazgo_fotos WHERE id = ? AND hallazgo_id = ?').get(req.params.fotoId, req._hallazgo.id);
  if (!f) return res.status(404).json({ error: 'Foto no encontrada' });
  subir.single('foto')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto' });
    if (f.archivo !== req.file.filename) {
      const absPrevio = rutaArchivo(carpetaHallazgo(req._hallazgo.inspeccion_id, req._hallazgo.id), f.archivo);
      if (absPrevio && fs.existsSync(absPrevio)) fs.unlinkSync(absPrevio);
      db.prepare('UPDATE hallazgo_fotos SET archivo = ? WHERE id = ?').run(req.file.filename, f.id);
    }
    res.json(db.prepare('SELECT id, archivo, orden FROM hallazgo_fotos WHERE id = ?').get(f.id));
  });
});

// DELETE /api/hallazgos/:id/fotos/:fotoId -> borra la foto
router.delete('/:id/fotos/:fotoId', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  if (req._hallazgo.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden quitar fotos' });
  const f = db.prepare('SELECT * FROM hallazgo_fotos WHERE id = ? AND hallazgo_id = ?').get(req.params.fotoId, req._hallazgo.id);
  if (!f) return res.status(404).json({ error: 'Foto no encontrada' });
  db.prepare('DELETE FROM hallazgo_fotos WHERE id = ?').run(f.id);
  const abs = rutaArchivo(carpetaHallazgo(req._hallazgo.inspeccion_id, req._hallazgo.id), f.archivo);
  if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  res.json({ ok: true });
});

// ---------- MARCAS SOBRE DIAGRAMAS ----------

// POST /api/hallazgos/:id/marcas -> agrega una marca { diagrama_id, x_pct, y_pct }
router.post('/:id/marcas', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  if (req._hallazgo.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden agregar marcas' });
  const { diagrama_id, x_pct, y_pct } = req.body || {};
  const diagrama = db.prepare('SELECT id FROM plantilla_diagramas WHERE id = ? AND plantilla_id = ?')
    .get(diagrama_id, req._hallazgo.plantilla_id);
  if (!diagrama) return res.status(400).json({ error: 'El diagrama indicado no pertenece a la plantilla de esta inspección' });
  const x = Number(x_pct);
  const y = Number(y_pct);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
    return res.status(400).json({ error: 'Posición de marca no válida' });
  }
  const info = db.prepare(
    'INSERT INTO hallazgo_marcas_diagrama (hallazgo_id, diagrama_id, x_pct, y_pct) VALUES (?, ?, ?, ?)'
  ).run(req._hallazgo.id, diagrama.id, x, y);
  res.status(201).json(db.prepare('SELECT id, diagrama_id, x_pct, y_pct FROM hallazgo_marcas_diagrama WHERE id = ?').get(info.lastInsertRowid));
});

// DELETE /api/hallazgos/:id/marcas/:marcaId -> borra una marca
router.delete('/:id/marcas/:marcaId', checkRol('inspector', 'supervisor', 'admin'), cargarHallazgo, (req, res) => {
  if (req._hallazgo.inspeccion_estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se pueden quitar marcas' });
  const m = db.prepare('SELECT * FROM hallazgo_marcas_diagrama WHERE id = ? AND hallazgo_id = ?').get(req.params.marcaId, req._hallazgo.id);
  if (!m) return res.status(404).json({ error: 'Marca no encontrada' });
  db.prepare('DELETE FROM hallazgo_marcas_diagrama WHERE id = ?').run(m.id);
  res.json({ ok: true });
});

router.obtenerHallazgo = obtenerHallazgo;
router.carpetaHallazgo = carpetaHallazgo;
router.rutaArchivo = rutaArchivo;
module.exports = router;
