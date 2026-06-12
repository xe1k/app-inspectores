// Prueba local: genera el PDF del informe de una inspección sin pasar por HTTP.
// Uso: node _test-informe.js [inspeccion_id]
const path = require('path');
const fs = require('fs');
const db = require('./src/db');
const plantillasRouter = require('./src/routes/plantillas');
const hallazgosRouter = require('./src/routes/hallazgos');
const { construirHtmlInforme, generarPdfBuffer, imagenComoDataUri, infoImagen } = require('./src/informes');

const id = Number(process.argv[2]) || db.prepare(
  `SELECT i.id FROM inspecciones i
   JOIN hallazgos h ON h.inspeccion_id = i.id
   GROUP BY i.id ORDER BY COUNT(*) DESC LIMIT 1`
).get().id;

const insp = db.prepare(
  `SELECT i.*, p.modelo AS plantilla_modelo, p.tipo AS plantilla_tipo
   FROM inspecciones i JOIN plantillas_equipo p ON p.id = i.plantilla_id WHERE i.id = ?`
).get(id);
if (!insp) { console.error('Inspección no encontrada:', id); process.exit(1); }

insp.hallazgos = db.prepare('SELECT id FROM hallazgos WHERE inspeccion_id = ? ORDER BY numero').all(id);

const plantilla = plantillasRouter.obtenerPlantilla(insp.plantilla_id);
const carpetaPlant = plantillasRouter.carpetaPlantilla(plantilla.id);
const diagramas = plantilla.diagramas.map(d => ({
  id: d.id, nombre: d.nombre,
  imagen: imagenComoDataUri(plantillasRouter.rutaArchivo(carpetaPlant, d.archivo)),
  marcas: []
}));
const diagramasPorId = new Map(diagramas.map(d => [d.id, d]));

const hallazgos = insp.hallazgos.map(({ id: hid }) => {
  const h = hallazgosRouter.obtenerHallazgo(hid);
  const carpetaH = hallazgosRouter.carpetaHallazgo(insp.id, h.id);
  const fotos = h.fotos.map(f => infoImagen(hallazgosRouter.rutaArchivo(carpetaH, f.archivo))).filter(Boolean);
  for (const m of h.marcas) {
    const d = diagramasPorId.get(m.diagrama_id);
    if (d) d.marcas.push({ x_pct: m.x_pct, y_pct: m.y_pct, numero: h.numero, criticidad: h.criticidad });
  }
  console.log(`Hallazgo N°${h.numero}: ${fotos.length} fotos, ratios = [${fotos.map(f => f.ratio ? f.ratio.toFixed(2) : '?').join(', ')}]`);
  return { ...h, fotos };
});

const carpetaInsp = path.join(__dirname, 'data', 'inspecciones', String(insp.id));
const fotoPortada = insp.foto_portada ? imagenComoDataUri(path.join(carpetaInsp, insp.foto_portada)) : null;

const html = construirHtmlInforme({
  inspeccion: insp, plantilla, hallazgos, diagramas,
  inspector: { nombre: 'Inspector de prueba' }, fotoPortada, tamano: process.argv[3] || 'grande'
});

fs.writeFileSync(path.join(__dirname, '_test-informe.html'), html);
generarPdfBuffer(html).then(pdf => {
  const salida = path.join(__dirname, '_test-informe.pdf');
  fs.writeFileSync(salida, pdf);
  console.log(`OK — inspección ${id} (${insp.equipo}), ${hallazgos.length} hallazgos -> ${salida} (${(pdf.length / 1024 / 1024).toFixed(1)} MB)`);
}).catch(e => { console.error('Error:', e); process.exit(1); });
