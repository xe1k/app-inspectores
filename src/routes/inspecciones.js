// Inspecciones: cabecera (plantilla, equipo, OT, fecha, horómetro) + estado.
// Cada inspector ve y administra solo las suyas — no hay flujo de revisión.
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db');
const plantillasRouter = require('./plantillas');
const hallazgosRouter = require('./hallazgos');
const { construirHtmlInforme, generarPdfBuffer, imagenComoDataUri, infoImagen } = require('../informes');
const { calcularHashFirma, minutosBloqueoPin, registrarFalloPin, limpiarFallosPin } = require('../utils/firma');
const { checkRol } = require('../middleware/auth');

const router = express.Router();

const CARPETA_DATOS = path.join(__dirname, '..', '..', 'data', 'inspecciones');
function carpetaInspeccion(id) {
  return path.join(CARPETA_DATOS, String(id));
}

// La foto de portada (equipo) vive como portada.<ext> en la carpeta de la inspección.
const EXT_FOTO_OK = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const subirPortada = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const carpeta = carpetaInspeccion(req.params.id);
      if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
      cb(null, carpeta);
    },
    filename(req, file, cb) {
      cb(null, `portada${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (EXT_FOTO_OK.has(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Solo se permiten imágenes (.jpg, .png, .webp)'));
  }
});

function obtenerInspeccion(id, inspectorId) {
  const insp = db.prepare(
    `SELECT i.*, p.modelo AS plantilla_modelo, p.tipo AS plantilla_tipo,
            COALESCE(NULLIF(uf.nombre_completo, ''), uf.nombre) AS firma_nombre,
            uf.rut AS firma_rut, uf.cargo AS firma_cargo, uf.firma_imagen AS firma_imagen
     FROM inspecciones i
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     LEFT JOIN usuarios uf ON uf.id = i.firma_usuario_id
     WHERE i.id = ? AND i.inspector_id = ?`
  ).get(id, inspectorId);
  if (!insp) return null;
  const hallazgos = db.prepare(
    `SELECT id, numero, sistema, sector, codigo, criticidad, preexistencia, creado_en
     FROM hallazgos WHERE inspeccion_id = ? ORDER BY numero`
  ).all(insp.id);
  return { ...insp, hallazgos };
}

// GET /api/inspecciones -> las del inspector en sesión, más recientes primero
router.get('/', (req, res) => {
  const filas = db.prepare(
    `SELECT i.*, p.modelo AS plantilla_modelo
     FROM inspecciones i
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     WHERE i.inspector_id = ?
     ORDER BY i.creado_en DESC`
  ).all(req.session.usuario.id);
  res.json(filas);
});

// GET /api/inspecciones/:id -> detalle con cabecera, plantilla y hallazgos
router.get('/:id', (req, res) => {
  const insp = obtenerInspeccion(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  res.json(insp);
});

// GET /api/inspecciones/:id/hallazgos-resumen -> conteo de hallazgos por estado
router.get('/:id/hallazgos-resumen', (req, res) => {
  const insp = db.prepare('SELECT id FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspeccion no encontrada' });
  const filas = db.prepare(
    'SELECT estado, COUNT(*) AS total FROM hallazgos WHERE inspeccion_id = ? GROUP BY estado'
  ).all(insp.id);
  const resumen = { detectado: 0, en_reparacion: 0, resuelto: 0, verificado: 0 };
  for (const f of filas) if (f.estado in resumen) resumen[f.estado] = f.total;
  res.json(resumen);
});

// GET /api/inspecciones/:id/informe -> genera (y descarga) el PDF del informe completo
router.get('/:id/informe', async (req, res) => {
  const insp = obtenerInspeccion(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (!insp.hallazgos.length) return res.status(400).json({ error: 'Agrega al menos un hallazgo antes de generar el informe' });

  const plantilla = plantillasRouter.obtenerPlantilla(insp.plantilla_id);
  const carpetaPlant = plantillasRouter.carpetaPlantilla(plantilla.id);
  const diagramas = plantilla.diagramas.map(d => ({
    id: d.id,
    nombre: d.nombre,
    imagen: imagenComoDataUri(plantillasRouter.rutaArchivo(carpetaPlant, d.archivo)),
    marcas: []
  }));
  const diagramasPorId = new Map(diagramas.map(d => [d.id, d]));

  const hallazgosCompletos = insp.hallazgos.map(resumen => {
    const h = hallazgosRouter.obtenerHallazgo(resumen.id);
    const carpetaH = hallazgosRouter.carpetaHallazgo(insp.id, h.id);
    // infoImagen incluye las dimensiones reales para distribuir las fotos según su orientación
    const fotos = h.fotos
      .map(f => infoImagen(hallazgosRouter.rutaArchivo(carpetaH, f.archivo)))
      .filter(Boolean);
    for (const m of h.marcas) {
      const d = diagramasPorId.get(m.diagrama_id);
      if (d) d.marcas.push({ x_pct: m.x_pct, y_pct: m.y_pct, numero: h.numero, criticidad: h.criticidad });
    }
    return { ...h, fotos };
  });

  const fotoPortada = insp.foto_portada
    ? imagenComoDataUri(path.join(carpetaInspeccion(insp.id), insp.foto_portada))
    : null;

  const html = construirHtmlInforme({
    inspeccion: insp,
    plantilla,
    hallazgos: hallazgosCompletos,
    diagramas,
    inspector: req.session.usuario,
    fotoPortada
  });

  let pdf;
  try {
    pdf = await generarPdfBuffer(html);
  } catch (e) {
    console.error('Error generando el PDF del informe:', e);
    return res.status(500).json({ error: `No se pudo generar el PDF del informe. Intenta nuevamente. (Detalle técnico: ${e.message})` });
  }

  const carpeta = carpetaInspeccion(insp.id);
  if (!fs.existsSync(carpeta)) fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, 'informe.pdf'), pdf);
  db.prepare(`UPDATE inspecciones SET pdf_archivo = 'informe.pdf', pdf_generado_en = datetime('now','localtime') WHERE id = ?`)
    .run(insp.id);

  const nombreDescarga = `Informe_${insp.equipo}_${insp.fecha}`.replace(/[^\w.-]+/g, '_') + '.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreDescarga}"`);
  res.send(pdf);
});

// POST /api/inspecciones/:id/foto -> sube o reemplaza la foto de portada (campo "foto")
router.post('/:id/foto', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (insp.estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se puede cambiar la foto de portada' });
  subirPortada.single('foto')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna foto' });
    if (insp.foto_portada && insp.foto_portada !== req.file.filename) {
      const previa = path.join(carpetaInspeccion(insp.id), insp.foto_portada);
      if (fs.existsSync(previa)) fs.unlinkSync(previa);
    }
    db.prepare('UPDATE inspecciones SET foto_portada = ? WHERE id = ?').run(req.file.filename, insp.id);
    res.status(201).json({ foto_portada: req.file.filename });
  });
});

// GET /api/inspecciones/:id/foto -> sirve la imagen de portada (foto del equipo)
router.get('/:id/foto', (req, res) => {
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp || !insp.foto_portada) return res.status(404).end();
  const abs = path.join(carpetaInspeccion(insp.id), insp.foto_portada);
  if (!fs.existsSync(abs)) return res.status(404).end();
  res.sendFile(abs);
});

// DELETE /api/inspecciones/:id/foto -> quita la foto de portada
router.delete('/:id/foto', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (insp.estado !== 'en_curso') return res.status(409).json({ error: 'La inspección ya está completada; no se puede quitar la foto de portada' });
  if (insp.foto_portada) {
    const abs = path.join(carpetaInspeccion(insp.id), insp.foto_portada);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    db.prepare('UPDATE inspecciones SET foto_portada = NULL WHERE id = ?').run(insp.id);
  }
  res.json({ ok: true });
});

// POST /api/inspecciones -> inicia una inspección nueva, basada en una plantilla
// Número GPS válido o null (no confiar en el cliente).
function numeroONull(v, min, max) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

router.post('/', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const { plantilla_id, equipo, ot, fecha, horometro, fecha_inicio, latitud, longitud, precision_gps, ubicacion_nombre } = req.body || {};
  const plantilla = db.prepare('SELECT id FROM plantillas_equipo WHERE id = ?').get(plantilla_id);
  if (!plantilla) return res.status(400).json({ error: 'Selecciona una plantilla de equipo válida' });
  const eq = (equipo || '').trim();
  if (!eq) return res.status(400).json({ error: 'El equipo es obligatorio (ej. CAEX-203)' });
  const f = (fecha || '').trim();
  if (!f) return res.status(400).json({ error: 'La fecha es obligatoria' });

  // Timestamp de inicio: el del cliente si es un ISO válido; si no, el del servidor (UTC).
  const inicio = (typeof fecha_inicio === 'string' && !Number.isNaN(Date.parse(fecha_inicio)))
    ? new Date(fecha_inicio).toISOString()
    : new Date().toISOString();
  const lat = numeroONull(latitud, -90, 90);
  const lng = numeroONull(longitud, -180, 180);
  const prec = numeroONull(precision_gps, 0, 100000);
  const ubicacion = (typeof ubicacion_nombre === 'string' && ubicacion_nombre.trim()) || (lat == null ? 'Sin GPS' : null);

  const info = db.prepare(
    `INSERT INTO inspecciones (inspector_id, plantilla_id, equipo, ot, fecha, horometro,
       fecha_inicio, latitud, longitud, precision_gps, ubicacion_nombre)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(req.session.usuario.id, plantilla.id, eq, (ot || '').trim() || null, f, (horometro ?? '').toString().trim() || null,
        inicio, lat, lat != null ? lng : null, lat != null ? prec : null, ubicacion);

  res.status(201).json(obtenerInspeccion(info.lastInsertRowid, req.session.usuario.id));
});

// PUT /api/inspecciones/:id -> edita la cabecera y/o cambia el estado
router.put('/:id', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (insp.firmada) {
    return res.status(409).json({ error: 'La inspección está firmada y no se puede modificar. Usa "Reabrir para corregir" (invalida la firma).' });
  }

  const { equipo, ot, fecha, horometro, estado } = req.body || {};
  const eq = equipo != null ? equipo.trim() : insp.equipo;
  const f = fecha != null ? fecha.trim() : insp.fecha;
  if (!eq) return res.status(400).json({ error: 'El equipo es obligatorio' });
  if (!f) return res.status(400).json({ error: 'La fecha es obligatoria' });

  let nuevoEstado = insp.estado;
  if (estado != null) {
    if (!['en_curso', 'completada'].includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
    if (estado === 'completada') {
      const n = db.prepare('SELECT COUNT(*) AS n FROM hallazgos WHERE inspeccion_id = ?').get(insp.id).n;
      if (n === 0) return res.status(400).json({ error: 'Agrega al menos un hallazgo antes de marcar la inspección como completada' });
    }
    nuevoEstado = estado;
  }

  // fecha_cierre: se fija al completar y se limpia si la inspección se reabre.
  let fechaCierre = insp.fecha_cierre;
  if (nuevoEstado === 'completada' && insp.estado !== 'completada') fechaCierre = new Date().toISOString();
  if (nuevoEstado === 'en_curso') fechaCierre = null;

  db.prepare(
    `UPDATE inspecciones
     SET equipo = ?, ot = ?, fecha = ?, horometro = ?, estado = ?, fecha_cierre = ?, actualizado_en = datetime('now','localtime')
     WHERE id = ?`
  ).run(eq, ot != null ? (ot.trim() || null) : insp.ot, f,
        horometro != null ? (horometro.toString().trim() || null) : insp.horometro,
        nuevoEstado, fechaCierre, insp.id);

  res.json(obtenerInspeccion(insp.id, req.session.usuario.id));
});

// ---------- Firma digital ----------

// Valida el PIN del usuario en sesión aplicando el bloqueo por intentos
// (5 fallos consecutivos => 5 minutos). Devuelve null si el PIN es correcto,
// o { status, body } con la respuesta de error. El PIN nunca se loguea.
function validarPin(usuario, pin) {
  const u = db.prepare('SELECT pin_hash FROM usuarios WHERE id = ?').get(usuario.id);
  if (!u || !u.pin_hash) {
    return { status: 409, body: { error: 'Primero debes configurar tu PIN de firma en tu perfil', sin_pin: true } };
  }
  const minutos = minutosBloqueoPin(usuario.id);
  if (minutos > 0) {
    return { status: 429, body: { error: `Demasiados intentos fallidos. La firma está bloqueada por ${minutos} minuto${minutos === 1 ? '' : 's'}.` } };
  }
  if (!/^\d{4}$/.test(String(pin ?? ''))) {
    return { status: 400, body: { error: 'Ingresa tu PIN de 4 dígitos' } };
  }
  if (!bcrypt.compareSync(String(pin), u.pin_hash)) {
    const bloqueado = registrarFalloPin(usuario.id);
    return {
      status: 401,
      body: { error: bloqueado ? 'PIN incorrecto. Superaste los 5 intentos: la firma queda bloqueada por 5 minutos.' : 'PIN incorrecto. Verifica e intenta de nuevo.' }
    };
  }
  limpiarFallosPin(usuario.id);
  return null;
}

// POST /api/inspecciones/:id/firmar { pin } -> firma y completa la inspección.
// El timestamp de firma SIEMPRE es del servidor. No loguear el body (trae el PIN).
router.post('/:id/firmar', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (insp.firmada) return res.status(409).json({ error: 'La inspección ya está firmada' });
  const n = db.prepare('SELECT COUNT(*) AS n FROM hallazgos WHERE inspeccion_id = ?').get(insp.id).n;
  if (n === 0) return res.status(400).json({ error: 'Agrega al menos un hallazgo antes de firmar la inspección' });

  const errorPin = validarPin(req.session.usuario, (req.body || {}).pin);
  if (errorPin) return res.status(errorPin.status).json(errorPin.body);

  const ahora = new Date().toISOString();
  const hash = calcularHashFirma(insp.id, req.session.usuario.id, ahora);
  db.transaction(() => {
    db.prepare(
      `UPDATE inspecciones
       SET firmada = 1, firma_usuario_id = ?, firma_timestamp = ?, firma_hash = ?,
           estado = 'completada', fecha_cierre = COALESCE(fecha_cierre, ?),
           actualizado_en = datetime('now','localtime')
       WHERE id = ?`
    ).run(req.session.usuario.id, ahora, hash, ahora, insp.id);
    db.prepare(
      `INSERT INTO auditoria_firmas (inspeccion_id, usuario_id, accion, timestamp) VALUES (?, ?, 'firmada', ?)`
    ).run(insp.id, req.session.usuario.id, ahora);
  })();

  res.json(obtenerInspeccion(insp.id, req.session.usuario.id));
});

// POST /api/inspecciones/:id/reabrir { pin, motivo } -> invalida la firma para
// corregir. Requiere el PIN de nuevo y un motivo, que queda en la auditoría.
router.post('/:id/reabrir', checkRol('inspector', 'supervisor', 'admin'), (req, res) => {
  const insp = db.prepare('SELECT * FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (!insp.firmada) return res.status(409).json({ error: 'La inspección no está firmada; usa el flujo normal de reapertura' });

  const motivo = ((req.body || {}).motivo || '').trim();
  if (!motivo) return res.status(400).json({ error: 'Indica el motivo de la reapertura (queda registrado en la auditoría)' });

  const errorPin = validarPin(req.session.usuario, (req.body || {}).pin);
  if (errorPin) return res.status(errorPin.status).json(errorPin.body);

  const ahora = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE inspecciones
       SET firmada = 0, firma_usuario_id = NULL, firma_timestamp = NULL, firma_hash = NULL,
           estado = 'en_curso', fecha_cierre = NULL, actualizado_en = datetime('now','localtime')
       WHERE id = ?`
    ).run(insp.id);
    db.prepare(
      `INSERT INTO auditoria_firmas (inspeccion_id, usuario_id, accion, timestamp, motivo) VALUES (?, ?, 'invalidada', ?, ?)`
    ).run(insp.id, req.session.usuario.id, ahora, motivo);
  })();

  res.json(obtenerInspeccion(insp.id, req.session.usuario.id));
});

// GET /api/inspecciones/:id/verificar-firma -> recalcula el hash con los datos
// actuales y lo compara con el guardado al firmar.
router.get('/:id/verificar-firma', (req, res) => {
  const insp = db.prepare(
    `SELECT i.*, COALESCE(NULLIF(u.nombre_completo, ''), u.nombre) AS firma_nombre
     FROM inspecciones i LEFT JOIN usuarios u ON u.id = i.firma_usuario_id
     WHERE i.id = ? AND i.inspector_id = ?`
  ).get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (!insp.firmada) return res.json({ firmada: false, valida: false });

  const hashActual = calcularHashFirma(insp.id, insp.firma_usuario_id, insp.firma_timestamp);
  res.json({
    firmada: true,
    valida: hashActual === insp.firma_hash,
    firmada_por: insp.firma_nombre,
    fecha_firma: insp.firma_timestamp
  });
});

// PATCH /api/inspecciones/:id/completar -> reemplazado por la firma digital.
router.patch('/:id/completar', (req, res) => {
  res.status(410).json({ error: 'Usar /firmar' });
});

// POST /api/inspecciones/:id/nueva-revision
// Crea una nueva inspección copiando los hallazgos de la anterior para la revisión guiada.
router.post('/:id/nueva-revision', (req, res) => {
  const base = obtenerInspeccion(req.params.id, req.session.usuario.id);
  if (!base) return res.status(404).json({ error: 'Inspección no encontrada' });
  if (base.estado !== 'completada') return res.status(409).json({ error: 'Solo se puede iniciar una revisión desde una inspección completada' });

  const { fecha, ot, horometro } = req.body || {};
  const f = (fecha || '').trim();
  if (!f) return res.status(400).json({ error: 'La fecha es obligatoria' });

  const nuevaInfo = db.prepare(
    `INSERT INTO inspecciones (inspector_id, plantilla_id, equipo, ot, fecha, horometro, inspeccion_base_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.session.usuario.id, base.plantilla_id, base.equipo,
        (ot || '').trim() || null, f,
        (horometro ?? '').toString().trim() || null,
        base.id);

  const nuevaId = nuevaInfo.lastInsertRowid;

  // Copiar hallazgos con referencia al origen
  const hallazgosBase = db.prepare(
    'SELECT * FROM hallazgos WHERE inspeccion_id = ? ORDER BY numero'
  ).all(base.id);

  const insertarHallazgo = db.prepare(
    `INSERT INTO hallazgos
       (inspeccion_id, numero, sistema, sector, codigo, criticidad,
        descripcion_dano, trabajo_realizar, recomendacion, tiempo_reparacion,
        recursos, preexistencia, hallazgo_origen_id, estado_revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  );

  for (const h of hallazgosBase) {
    insertarHallazgo.run(
      nuevaId, h.numero, h.sistema, h.sector, h.codigo, h.criticidad,
      h.descripcion_dano, h.trabajo_realizar, h.recomendacion, h.tiempo_reparacion,
      h.recursos, 'si', h.id
    );
  }

  res.status(201).json({ inspeccion_id: nuevaId });
});

// DELETE /api/inspecciones/:id -> elimina la inspección y sus hallazgos (cascada)
router.delete('/:id', (req, res) => {
  const insp = db.prepare('SELECT id FROM inspecciones WHERE id = ? AND inspector_id = ?')
    .get(req.params.id, req.session.usuario.id);
  if (!insp) return res.status(404).json({ error: 'Inspección no encontrada' });
  db.prepare('DELETE FROM inspecciones WHERE id = ?').run(insp.id); // cascada: hallazgos, fotos y marcas
  const carpeta = carpetaInspeccion(insp.id);
  if (fs.existsSync(carpeta)) fs.rmSync(carpeta, { recursive: true, force: true });
  res.json({ ok: true });
});

module.exports = router;
