// Carga los diagramas de referencia del PPT (980E Chasis) a la plantilla una sola vez.
// Ejecutar: node importar_diagramas.js
// Inocuo si se ejecuta de nuevo: no duplica si el nombre ya existe.
const fs = require('fs');
const path = require('path');
const db = require('./src/db');

const PLANTILLA_ID = 4; // 980E – Chasis
const ORIGEN = path.join(__dirname, '..', '_diagrams_export');
const DEST = path.join(__dirname, 'data', 'plantillas', String(PLANTILLA_ID));

const DIAGRAMAS = [
  { slide: 4,  nombre: 'Chasis principal — Vista exterior y códigos de zona' },
  { slide: 5,  nombre: 'Chasis principal — Vista lateral derecha' },
  { slide: 6,  nombre: 'Chasis principal — Vista lateral izquierda' },
  { slide: 7,  nombre: 'Alerones y Horse Collar' },
  { slide: 8,  nombre: 'Parante y vigas diagonales' },
  { slide: 9,  nombre: 'Zona de asentamiento y sistemas hidráulicos' },
  { slide: 10, nombre: 'Sub-chasis — Códigos de zona' },
  { slide: 11, nombre: 'Sub-chasis — Vista general' },
  { slide: 12, nombre: 'Sistemas complementarios y soldaduras' },
];

if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

const existentes = db.prepare('SELECT nombre FROM plantilla_diagramas WHERE plantilla_id = ?').all(PLANTILLA_ID).map(r => r.nombre);
const maxOrden = db.prepare('SELECT COALESCE(MAX(orden),0) AS m FROM plantilla_diagramas WHERE plantilla_id = ?').get(PLANTILLA_ID).m;

let insertados = 0;
let orden = maxOrden;

for (const d of DIAGRAMAS) {
  if (existentes.includes(d.nombre)) {
    console.log(`  ya existe: ${d.nombre}`);
    continue;
  }
  const origen = path.join(ORIGEN, `slide${d.slide}.png`);
  if (!fs.existsSync(origen)) {
    console.log(`  no encontrado: slide${d.slide}.png`);
    continue;
  }
  orden++;
  const archivo = `diagrama_slide${d.slide}.png`;
  fs.copyFileSync(origen, path.join(DEST, archivo));
  db.prepare('INSERT INTO plantilla_diagramas (plantilla_id, nombre, archivo, orden) VALUES (?, ?, ?, ?)').run(PLANTILLA_ID, d.nombre, archivo, orden);
  console.log(`  importado [${orden}]: ${d.nombre}`);
  insertados++;
}

console.log(`\nListo: ${insertados} diagramas importados a plantilla ${PLANTILLA_ID}.`);
