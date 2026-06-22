// Catálogo de equipos derivado de las inspecciones existentes. No existe una
// tabla "equipos": el campo `equipo` de cada inspección es texto libre, así
// que se agrupa por una versión normalizada para que "CAEX-209" y "caex 209"
// se reconozcan como el mismo equipo.
const express = require('express');
const db = require('../db');

const router = express.Router();

// Normaliza para agrupar y como clave de URL: mayúsculas, espacios/guiones/
// guiones bajos repetidos colapsados a un solo "-".
function normalizarEquipo(s) {
  return (s || '')
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Agrupa todas las inspecciones del inspector por equipo normalizado.
// Devuelve un Map equipo_norm -> { ...resumen, inspecciones: [...] (fecha DESC) }
function agruparPorEquipo(inspectorId) {
  const inspecciones = db.prepare(
    `SELECT i.id, i.equipo, i.ot, i.fecha, i.fecha_inicio, i.fecha_cierre,
            i.horometro, i.estado, i.firmada, i.creado_en,
            p.id AS plantilla_id, p.modelo AS plantilla_modelo, p.tipo AS plantilla_tipo
     FROM inspecciones i
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     WHERE i.inspector_id = ?
     -- Ordenar por DIA (no por timestamp): la inspeccion base guarda
     -- fecha_inicio con hora completa y la revision guiada solo fecha
     -- (fecha sola). Comparar el texto crudo mezclaria ambos formatos y
     -- una base del mismo dia ganaria a su revision. A igual dia,
     -- desempata i.id DESC (la revision, creada despues, tiene id mayor).
     ORDER BY date(COALESCE(i.fecha_inicio, i.fecha, i.creado_en)) DESC, i.id DESC`
  ).all(inspectorId);

  const grupos = new Map();
  if (!inspecciones.length) return grupos;

  const ids = inspecciones.map((i) => i.id);
  const placeholders = ids.map(() => '?').join(',');

  // Hallazgos críticos (alta) por inspección.
  const criticosPorInsp = new Map(
    db.prepare(
      `SELECT inspeccion_id, COUNT(*) AS n FROM hallazgos
       WHERE inspeccion_id IN (${placeholders}) AND criticidad = 'alta'
       GROUP BY inspeccion_id`
    ).all(...ids).map((r) => [r.inspeccion_id, r.n])
  );

  // Conteo de hallazgos por criticidad, por inspección (para el resumen de cada informe).
  const hallazgosPorInsp = new Map();
  for (const r of db.prepare(
    `SELECT inspeccion_id, criticidad, COUNT(*) AS n FROM hallazgos
     WHERE inspeccion_id IN (${placeholders}) GROUP BY inspeccion_id, criticidad`
  ).all(...ids)) {
    if (!hallazgosPorInsp.has(r.inspeccion_id)) {
      hallazgosPorInsp.set(r.inspeccion_id, { alta: 0, media: 0, baja: 0, total: 0 });
    }
    const h = hallazgosPorInsp.get(r.inspeccion_id);
    h[r.criticidad] = r.n;
    h.total += r.n;
  }

  for (const insp of inspecciones) {
    const norm = normalizarEquipo(insp.equipo);
    if (!norm) continue;
    if (!grupos.has(norm)) {
      // La primera fila de cada grupo es la más reciente (orden DESC).
      grupos.set(norm, {
        equipo_norm: norm,
        equipo_display: insp.equipo.trim(),
        modelo: insp.plantilla_modelo,
        tipo: insp.plantilla_tipo,
        total_inspecciones: 0,
        ultima_fecha: insp.fecha_inicio || insp.fecha,
        ultima_inspeccion_id: insp.id,
        hallazgos_criticos_abiertos: 0,
        inspecciones: [],
      });
    }
    const g = grupos.get(norm);
    g.total_inspecciones += 1;
    g.hallazgos_criticos_abiertos += criticosPorInsp.get(insp.id) || 0;
    g.inspecciones.push({
      id: insp.id,
      ot: insp.ot,
      fecha: insp.fecha,
      fecha_inicio: insp.fecha_inicio,
      fecha_cierre: insp.fecha_cierre,
      horometro: insp.horometro,
      estado: insp.estado,
      firmada: insp.firmada,
      plantilla_id: insp.plantilla_id,
      plantilla_modelo: insp.plantilla_modelo,
      plantilla_tipo: insp.plantilla_tipo,
      hallazgos: hallazgosPorInsp.get(insp.id) || { alta: 0, media: 0, baja: 0, total: 0 },
    });
  }
  return grupos;
}

// GET /api/equipos -> catálogo de equipos del inspector.
// Orden: equipos con críticos abiertos primero, luego por última fecha DESC.
router.get('/', (req, res) => {
  const grupos = [...agruparPorEquipo(req.session.usuario.id).values()];
  grupos.sort((a, b) =>
    (b.hallazgos_criticos_abiertos > 0 ? 1 : 0) - (a.hallazgos_criticos_abiertos > 0 ? 1 : 0) ||
    String(b.ultima_fecha).localeCompare(String(a.ultima_fecha))
  );
  res.json(grupos.map(({ inspecciones, ...resumen }) => resumen));
});

// GET /api/equipos/:norm -> datos del equipo + sus inspecciones (fecha DESC)
router.get('/:norm', (req, res) => {
  const norm = normalizarEquipo(req.params.norm);
  const grupo = agruparPorEquipo(req.session.usuario.id).get(norm);
  if (!grupo) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(grupo);
});

module.exports = router;
