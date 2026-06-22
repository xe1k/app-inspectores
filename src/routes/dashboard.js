// Dashboard gerencial: resumen, salud de flota, tendencia y ranking de
// inspectores. Solo lectura, montado con checkRol('gerencial','admin').
const express = require('express');
const db = require('../db');

const router = express.Router();

// Caché en memoria simple (TTL 60s) por endpoint + query string.
const CACHE_TTL = 60 * 1000;
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.t > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.v;
}

function cacheSet(key, v) {
  cache.set(key, { t: Date.now(), v });
}

// periodo: '30' | '90' | 'anio' | 'todo' (por defecto '30')
function fechaCorte(periodo) {
  const hoy = new Date();
  switch (periodo) {
    case '90':
      hoy.setDate(hoy.getDate() - 90);
      return hoy.toISOString();
    case 'anio':
      hoy.setMonth(0, 1);
      hoy.setHours(0, 0, 0, 0);
      return hoy.toISOString();
    case 'todo':
      return null;
    default:
      hoy.setDate(hoy.getDate() - 30);
      return hoy.toISOString();
  }
}

function listaParam(v) {
  if (!v) return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

// Filtro común sobre inspecciones (alias i) + plantillas_equipo (alias p):
// período (sobre fecha_inicio/fecha), equipo(s), modelo(s).
function filtroInspecciones(req, { incluirPeriodo = true } = {}) {
  const condiciones = [];
  const params = [];
  if (incluirPeriodo) {
    const corte = fechaCorte(req.query.periodo);
    if (corte) {
      condiciones.push('COALESCE(i.fecha_inicio, i.fecha) >= ?');
      params.push(corte);
    }
  }
  const equipos = listaParam(req.query.equipo);
  if (equipos.length) {
    condiciones.push(`i.equipo IN (${equipos.map(() => '?').join(',')})`);
    params.push(...equipos);
  }
  const modelos = listaParam(req.query.modelo);
  if (modelos.length) {
    condiciones.push(`p.modelo IN (${modelos.map(() => '?').join(',')})`);
    params.push(...modelos);
  }
  return { sql: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', params };
}

// GET /api/dashboard/resumen?periodo&equipo&modelo
router.get('/resumen', (req, res) => {
  const key = `resumen:${req.originalUrl}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  const fSnapshot = filtroInspecciones(req, { incluirPeriodo: false });
  const fPeriodo = filtroInspecciones(req, { incluirPeriodo: true });

  const totalEquipos = db.prepare(
    `SELECT COUNT(DISTINCT i.equipo) AS n
     FROM inspecciones i JOIN plantillas_equipo p ON p.id = i.plantilla_id
     ${fSnapshot.sql}`
  ).get(...fSnapshot.params).n;

  const inspeccionesPeriodo = db.prepare(
    `SELECT COUNT(*) AS n
     FROM inspecciones i JOIN plantillas_equipo p ON p.id = i.plantilla_id
     ${fPeriodo.sql}`
  ).get(...fPeriodo.params).n;

  // Hallazgos registrados (foto del momento, filtrados por equipo/modelo).
  const abiertos = db.prepare(
    `SELECT
       SUM(CASE WHEN h.criticidad = 'alta' THEN 1 ELSE 0 END) AS criticos,
       COUNT(*) AS total,
       SUM(CAST(h.tiempo_reparacion AS REAL)) AS horas,
       SUM(CAST(h.recursos AS REAL)) AS personas
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     ${fSnapshot.sql}`
  ).get(...fSnapshot.params);

  const resultado = {
    total_equipos: totalEquipos,
    inspecciones_mes: inspeccionesPeriodo,
    hallazgos_criticos_abiertos: abiertos.criticos || 0,
    hallazgos_totales_abiertos: abiertos.total || 0,
    horas_pendientes: Math.round(abiertos.horas || 0),
    personas_requeridas: Math.round(abiertos.personas || 0),
  };
  cacheSet(key, resultado);
  res.json(resultado);
});

// GET /api/dashboard/equipos?periodo&equipo&modelo
router.get('/equipos', (req, res) => {
  const key = `equipos:${req.originalUrl}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  const f = filtroInspecciones(req, { incluirPeriodo: false });

  // Última inspección por equipo (modelo, fecha, horómetro). Orden por DÍA
  // (no por timestamp) + id DESC: la base guarda fecha_inicio con hora y la
  // revisión solo `fecha`, así que comparar el texto crudo desordenaría las
  // del mismo día (ver src/routes/equipos.js).
  const filas = db.prepare(
    `SELECT i.id, i.equipo, p.modelo, i.fecha_inicio, i.fecha, i.horometro
     FROM inspecciones i
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     ${f.sql}
     ORDER BY date(COALESCE(i.fecha_inicio, i.fecha)) DESC, i.id DESC`
  ).all(...f.params);

  const porEquipo = new Map();
  for (const fila of filas) {
    if (!porEquipo.has(fila.equipo)) {
      porEquipo.set(fila.equipo, {
        equipo: fila.equipo,
        modelo: fila.modelo,
        ultima_inspeccion: fila.fecha_inicio || fila.fecha,
        horometro_ultimo: fila.horometro,
        criticos: 0,
        medios: 0,
        bajos: 0,
      });
    }
  }

  // Hallazgos por equipo y criticidad.
  const hallazgos = db.prepare(
    `SELECT i.equipo, h.criticidad, COUNT(*) AS n
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     ${f.sql}
     GROUP BY i.equipo, h.criticidad`
  ).all(...f.params);

  for (const h of hallazgos) {
    const e = porEquipo.get(h.equipo);
    if (!e) continue;
    if (h.criticidad === 'alta') e.criticos = h.n;
    else if (h.criticidad === 'media') e.medios = h.n;
    else if (h.criticidad === 'baja') e.bajos = h.n;
  }

  const orden = { critico: 0, alerta: 1, normal: 2 };
  const resultado = [...porEquipo.values()]
    .map((e) => ({
      ...e,
      estado_salud: e.criticos > 0 ? 'critico' : e.medios > 2 ? 'alerta' : 'normal',
    }))
    .sort((a, b) => orden[a.estado_salud] - orden[b.estado_salud] || a.equipo.localeCompare(b.equipo));

  cacheSet(key, resultado);
  res.json(resultado);
});

// Número de semana ISO-8601 de una fecha.
function numeroSemanaISO(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaSemana = (date.getUTCDay() + 6) % 7; // 0 = lunes
  date.setUTCDate(date.getUTCDate() - diaSemana + 3);
  const primerJueves = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = (date - primerJueves) / 86400000;
  return 1 + Math.round(diff / 7);
}

// Genera los últimos n buckets semanales (lunes a domingo), terminando en la semana actual.
function generarSemanas(n) {
  const hoy = new Date();
  const lunesActual = new Date(hoy);
  const diaSemana = (lunesActual.getDay() + 6) % 7; // 0 = lunes
  lunesActual.setDate(lunesActual.getDate() - diaSemana);
  lunesActual.setHours(0, 0, 0, 0);

  const semanas = [];
  for (let i = n - 1; i >= 0; i--) {
    const inicio = new Date(lunesActual);
    inicio.setDate(inicio.getDate() - i * 7);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 7);
    semanas.push({ inicio, fin, semana: `Sem ${numeroSemanaISO(inicio)}`, inspecciones: 0, hallazgos_nuevos: 0 });
  }
  return semanas;
}

function asignarASemana(semanas, filas, campo) {
  for (const fila of filas) {
    const d = new Date(fila.fecha);
    if (Number.isNaN(d.getTime())) continue;
    for (const s of semanas) {
      if (d >= s.inicio && d < s.fin) {
        s[campo] += 1;
        break;
      }
    }
  }
}

// GET /api/dashboard/tendencia?equipo&modelo (últimas 8 semanas, fijo)
router.get('/tendencia', (req, res) => {
  const key = `tendencia:${req.originalUrl}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  const semanas = generarSemanas(8);
  const desde = semanas[0].inicio.toISOString();

  const f = filtroInspecciones(req, { incluirPeriodo: false });
  const prefijo = f.sql ? `${f.sql.replace(/^WHERE /, '')} AND ` : '';
  const params = [...f.params, desde];

  const filasInsp = db.prepare(
    `SELECT COALESCE(i.fecha_inicio, i.fecha) AS fecha
     FROM inspecciones i JOIN plantillas_equipo p ON p.id = i.plantilla_id
     WHERE ${prefijo}COALESCE(i.fecha_inicio, i.fecha) >= ?`
  ).all(...params);

  const filasNuevos = db.prepare(
    `SELECT COALESCE(h.fecha_creacion, h.creado_en) AS fecha
     FROM hallazgos h
     JOIN inspecciones i ON i.id = h.inspeccion_id
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     WHERE ${prefijo}COALESCE(h.fecha_creacion, h.creado_en) >= ?`
  ).all(...params);

  asignarASemana(semanas, filasInsp, 'inspecciones');
  asignarASemana(semanas, filasNuevos, 'hallazgos_nuevos');

  const resultado = semanas.map(({ semana, inspecciones, hallazgos_nuevos }) => ({
    semana,
    inspecciones,
    hallazgos_nuevos,
  }));

  cacheSet(key, resultado);
  res.json(resultado);
});

// GET /api/dashboard/inspectores?periodo&equipo&modelo
router.get('/inspectores', (req, res) => {
  const key = `inspectores:${req.originalUrl}`;
  const cached = cacheGet(key);
  if (cached) return res.json(cached);

  const f = filtroInspecciones(req, { incluirPeriodo: true });

  const filas = db.prepare(
    `SELECT COALESCE(NULLIF(u.nombre_completo, ''), u.nombre) AS inspector,
            COUNT(DISTINCT i.id) AS inspecciones,
            COUNT(h.id) AS hallazgos
     FROM inspecciones i
     JOIN plantillas_equipo p ON p.id = i.plantilla_id
     JOIN usuarios u ON u.id = i.inspector_id
     LEFT JOIN hallazgos h ON h.inspeccion_id = i.id
     ${f.sql}
     GROUP BY u.id
     ORDER BY inspecciones DESC`
  ).all(...f.params);

  const resultado = filas.map((r) => ({
    inspector: r.inspector,
    inspecciones_mes: r.inspecciones,
    hallazgos_registrados: r.hallazgos,
    promedio_hallazgos_por_inspeccion: r.inspecciones > 0 ? Math.round((r.hallazgos / r.inspecciones) * 10) / 10 : 0,
  }));

  cacheSet(key, resultado);
  res.json(resultado);
});

module.exports = router;
