// Plantillas de equipo (modelos): contenido fijo reutilizable entre informes
// del mismo modelo — datos generales, páginas técnicas y diagramas de
// referencia para marcar hallazgos. Cualquier inspector puede crear o
// editar una plantilla cuando aparece un modelo nuevo.
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

const router = express.Router();

// Las imágenes de diagramas viven en disco, en data/plantillas/<plantilla_id>/
const BASE = path.join(__dirname, '..', '..', 'data', 'plantillas');
if (!fs.existsSync(BASE)) fs.mkdirSync(BASE, { recursive: true });

const EXT_OK = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function carpetaPlantilla(id) {
  return path.join(BASE, String(id));
}

// Ruta absoluta de un archivo SOLO si es hijo directo de la carpeta dada
// (evita "../" y rutas fuera del espacio de la plantilla).
function rutaArchivo(carpetaAbs, nombre) {
  if (!nombre || typeof nombre !== 'string') return null;
  const limpio = path.basename(nombre);
  if (limpio !== nombre) return null;
  const abs = path.join(carpetaAbs, limpio);
  if (path.dirname(abs) !== carpetaAbs) return null;
  return abs;
}

// Si ya existe un archivo con ese nombre, agrega "_2", "_3"… antes de la extensión.
function nombreLibre(carpetaAbs, original) {
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, path.extname(original)).replace(/[^\w.-]+/g, '_') || 'diagrama';
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
    const abs = carpetaPlantilla(req.params.id);
    if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
    req._carpetaAbs = abs;
    cb(null, abs);
  },
  filename(req, file, cb) {
    // multer entrega el nombre en latin1; lo pasamos a UTF-8 para acentos/ñ.
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, nombreLibre(req._carpetaAbs, original));
  }
});

const subir = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB por imagen
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (EXT_OK.has(ext)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (.jpg, .png, .webp)'));
  }
});

function obtenerPlantilla(id) {
  const p = db.prepare('SELECT * FROM plantillas_equipo WHERE id = ?').get(id);
  if (!p) return null;
  const diagramas = db.prepare(
    'SELECT id, nombre, archivo, orden FROM plantilla_diagramas WHERE plantilla_id = ? ORDER BY orden, id'
  ).all(id);
  return {
    ...p,
    datos_generales: p.datos_generales_json ? JSON.parse(p.datos_generales_json) : {},
    paginas_fijas: p.paginas_fijas_json ? JSON.parse(p.paginas_fijas_json) : [],
    diagramas
  };
}

// ---------- PLANTILLAS ----------

// GET /api/plantillas -> lista resumida, para el panel
router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, modelo, tipo, creado_en FROM plantillas_equipo ORDER BY modelo').all());
});

// GET /api/plantillas/:id -> detalle completo (datos generales, páginas, diagramas)
router.get('/:id', (req, res) => {
  const p = obtenerPlantilla(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
  res.json(p);
});

// ---------- ZONAS TÉCNICAS ----------

// GET /api/plantillas/:id/zonas -> catálogo completo de zonas de la plantilla
router.get('/:id/zonas', (req, res) => {
  const p = db.prepare('SELECT id FROM plantillas_equipo WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
  res.json(db.prepare(
    `SELECT id, sistema, sector, codigo, descripcion, criticidad_base, diagrama_id, coord_x, coord_y
     FROM zonas WHERE plantilla_id = ? ORDER BY sistema, sector, codigo`
  ).all(p.id));
});

// GET /api/plantillas/:id/sistemas -> sistemas únicos de la plantilla
router.get('/:id/sistemas', (req, res) => {
  const p = db.prepare('SELECT id FROM plantillas_equipo WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
  res.json(db.prepare(
    'SELECT DISTINCT sistema FROM zonas WHERE plantilla_id = ? ORDER BY sistema'
  ).all(p.id).map((f) => f.sistema));
});

// POST /api/plantillas -> crea una plantilla nueva
router.post('/', (req, res) => {
  const { modelo, tipo, datos_generales, paginas_fijas } = req.body || {};
  const m = (modelo || '').trim();
  if (!m) return res.status(400).json({ error: 'El modelo es obligatorio' });
  const info = db.prepare(
    `INSERT INTO plantillas_equipo (modelo, tipo, datos_generales_json, paginas_fijas_json, creado_por)
     VALUES (?, ?, ?, ?, ?)`
  ).run(m, (tipo || '').trim() || null, JSON.stringify(datos_generales || {}), JSON.stringify(paginas_fijas || []), req.session.usuario.id);
  res.status(201).json(obtenerPlantilla(info.lastInsertRowid));
});

// PUT /api/plantillas/:id -> edita datos generales y páginas fijas
router.put('/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM plantillas_equipo WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
  const { modelo, tipo, datos_generales, paginas_fijas } = req.body || {};
  const m = (modelo || '').trim();
  if (!m) return res.status(400).json({ error: 'El modelo es obligatorio' });
  db.prepare(
    `UPDATE plantillas_equipo SET modelo = ?, tipo = ?, datos_generales_json = ?, paginas_fijas_json = ? WHERE id = ?`
  ).run(m, (tipo || '').trim() || null, JSON.stringify(datos_generales || {}), JSON.stringify(paginas_fijas || []), p.id);
  res.json(obtenerPlantilla(p.id));
});

// DELETE /api/plantillas/:id -> borra la plantilla (si no la usa ninguna inspección)
router.delete('/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM plantillas_equipo WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
  const enUso = db.prepare('SELECT COUNT(*) AS n FROM inspecciones WHERE plantilla_id = ?').get(p.id).n;
  if (enUso > 0) return res.status(409).json({ error: 'No se puede eliminar: hay inspecciones que usan esta plantilla' });
  db.prepare('DELETE FROM plantillas_equipo WHERE id = ?').run(p.id); // cascada borra sus diagramas
  const carpeta = carpetaPlantilla(p.id);
  if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- DIAGRAMAS DE REFERENCIA ----------

// POST /api/plantillas/:id/diagramas -> sube una imagen nueva (campo "imagen")
router.post('/:id/diagramas', (req, res) => {
  const p = db.prepare('SELECT id FROM plantillas_equipo WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Plantilla no encontrada' });
  subir.single('imagen')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    const nombre = (req.body.nombre || '').trim()
      || path.basename(req.file.filename, path.extname(req.file.filename));
    const sig = db.prepare(
      'SELECT COALESCE(MAX(orden), -1) + 1 AS sig FROM plantilla_diagramas WHERE plantilla_id = ?'
    ).get(p.id).sig;
    const info = db.prepare(
      'INSERT INTO plantilla_diagramas (plantilla_id, nombre, archivo, orden) VALUES (?, ?, ?, ?)'
    ).run(p.id, nombre, req.file.filename, sig);
    res.status(201).json(db.prepare('SELECT id, nombre, archivo, orden FROM plantilla_diagramas WHERE id = ?').get(info.lastInsertRowid));
  });
});

// GET /api/plantillas/:id/diagramas/:diagramaId/imagen -> sirve el archivo de imagen
router.get('/:id/diagramas/:diagramaId/imagen', (req, res) => {
  const d = db.prepare('SELECT * FROM plantilla_diagramas WHERE id = ? AND plantilla_id = ?')
    .get(req.params.diagramaId, req.params.id);
  if (!d) return res.status(404).end();
  const abs = rutaArchivo(carpetaPlantilla(req.params.id), d.archivo);
  if (!abs || !fs.existsSync(abs)) return res.status(404).end();
  res.sendFile(abs);
});

// PUT /api/plantillas/:id/diagramas/:diagramaId -> renombra y/o reordena
router.put('/:id/diagramas/:diagramaId', (req, res) => {
  const d = db.prepare('SELECT * FROM plantilla_diagramas WHERE id = ? AND plantilla_id = ?')
    .get(req.params.diagramaId, req.params.id);
  if (!d) return res.status(404).json({ error: 'Diagrama no encontrado' });
  const { nombre, orden } = req.body || {};
  const nuevoNombre = nombre != null ? String(nombre).trim() : d.nombre;
  const ordenNum = Number(orden);
  const nuevoOrden = Number.isFinite(ordenNum) ? ordenNum : d.orden;
  db.prepare('UPDATE plantilla_diagramas SET nombre = ?, orden = ? WHERE id = ?').run(nuevoNombre, nuevoOrden, d.id);
  res.json(db.prepare('SELECT id, nombre, archivo, orden FROM plantilla_diagramas WHERE id = ?').get(d.id));
});

// DELETE /api/plantillas/:id/diagramas/:diagramaId -> borra la imagen y su registro
router.delete('/:id/diagramas/:diagramaId', (req, res) => {
  const d = db.prepare('SELECT * FROM plantilla_diagramas WHERE id = ? AND plantilla_id = ?')
    .get(req.params.diagramaId, req.params.id);
  if (!d) return res.status(404).json({ error: 'Diagrama no encontrado' });
  db.prepare('DELETE FROM plantilla_diagramas WHERE id = ?').run(d.id);
  const abs = rutaArchivo(carpetaPlantilla(req.params.id), d.archivo);
  if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  res.json({ ok: true });
});

router.obtenerPlantilla = obtenerPlantilla;
router.carpetaPlantilla = carpetaPlantilla;
router.rutaArchivo = rutaArchivo;
module.exports = router;
