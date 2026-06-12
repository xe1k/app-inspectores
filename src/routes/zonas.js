// Consultas transversales del catálogo de zonas técnicas.
// Las rutas por plantilla (/api/plantillas/:id/zonas y /sistemas) viven en
// plantillas.js; aquí van las búsquedas por nombre de sistema o sector.
// Acepta ?plantilla_id=N para acotar a una plantilla concreta.
const express = require('express');
const db = require('../db');

const router = express.Router();

function filtroPlantilla(req) {
  const id = Number(req.query.plantilla_id);
  return Number.isInteger(id) && id > 0 ? { sql: ' AND plantilla_id = ?', params: [id] } : { sql: '', params: [] };
}

// GET /api/sistemas/:sistema/sectores -> sectores únicos de un sistema
router.get('/sistemas/:sistema/sectores', (req, res) => {
  const { sql, params } = filtroPlantilla(req);
  res.json(db.prepare(
    `SELECT DISTINCT sector FROM zonas WHERE sistema = ?${sql} ORDER BY sector`
  ).all(req.params.sistema, ...params).map((f) => f.sector));
});

// GET /api/sectores/:sector/zonas -> zonas/códigos de un sector
router.get('/sectores/:sector/zonas', (req, res) => {
  const { sql, params } = filtroPlantilla(req);
  res.json(db.prepare(
    `SELECT id, plantilla_id, sistema, sector, codigo, descripcion, criticidad_base, diagrama_id, coord_x, coord_y
     FROM zonas WHERE sector = ?${sql} ORDER BY codigo`
  ).all(req.params.sector, ...params));
});

module.exports = router;
