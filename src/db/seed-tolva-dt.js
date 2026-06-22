// Seed de la plantilla "Tolva DT": carga sus 4 diagramas de referencia (las
// imágenes vienen del informe PPT original, guardadas en seed-assets/tolva-dt)
// y el catálogo de sectores leído de esos diagramas.
//
// A diferencia del 980E Chasis, la tolva NO tiene códigos alfanuméricos de zona:
// sus "zonas" son los nombres descriptivos de cada parte (de la nomenclatura
// básica del fabricante). El campo `codigo` guarda ese nombre.
//
// Ejecutar con: node src/db/seed-tolva-dt.js   (idempotente)
const fs = require('fs');
const path = require('path');

const SISTEMA = 'Tolva';

// Diagramas (orden = el del informe). archivo = nombre del PNG ya copiado a
// data/plantillas/<id>/. nombre = título legible que ve el inspector.
const DIAGRAMAS = [
  { asset: 'diagrama_tolvadt_descripcion.png', nombre: 'Descripción general — Tolva DT' },
  { asset: 'diagrama_tolvadt_despiece.png', nombre: 'Despiece y nomenclatura — Tolva DT' },
  { asset: 'diagrama_tolvadt_piso.png', nombre: 'Piso — armadura de piso' },
  { asset: 'diagrama_tolvadt_laterales.png', nombre: 'Laterales, revestimiento y accesorios' },
];

// Catálogo sector -> partes (nombres descriptivos = `codigo`). Tomado de la
// nomenclatura de los diagramas y de los sectores reales de los informes de
// tolva (longuerina, corta fuego, vigas centrales, front, gousset, etc.).
const SECTORES = {
  'Visera y canopy': [
    'Visera', 'Refuerzo esquina canopy', 'Protector canopy', 'Viga lateral canopy', 'Plancha frontal canopy',
  ],
  'Front y corta fuego': [
    'Front', 'Corta fuego LH', 'Corta fuego RH',
  ],
  'Piso — armadura': [
    'Longuerina delantera izquierda', 'Longuerina delantera derecha', 'Longuerina trasera',
    'Conjunto rígido de piso', 'Orejas internas (perno fwd)', 'Orejas externas (cilindro)',
    'Base esfera', 'Pasador bufer', 'Seguro de levante', 'Piso cola tolva',
  ],
  'Laterales y revestimiento': [
    'Plancha lateral izquierda', 'Plancha lateral derecha', 'Protección central',
    'Placa anti impacto', 'Corta flujo', 'Uñas triangulares',
  ],
  'Vigas estructurales': [
    'Vigas centrales', 'Vigas viseras', 'Viga pistola unión lateral', 'Gousset lateral',
    'Viga chasis cola tolva', 'Orejas pivote',
  ],
  'Accesorios': [
    'Guarda fango izquierdo', 'Guarda fango derecho', 'Cubre cables', 'Porta foco', 'Balde plástico',
  ],
};

function seed(db) {
  const plantilla = db.prepare(
    "SELECT id, modelo, tipo FROM plantillas_equipo WHERE modelo = 'Tolva DT' ORDER BY id LIMIT 1"
  ).get();

  if (!plantilla) {
    console.log('No se encontró la plantilla "Tolva DT"; no se cargó nada.');
    return;
  }

  // --- 1) Diagramas: copiar imágenes a data/plantillas/<id>/ y registrarlas ---
  const carpeta = path.join(db.dataDir, 'plantillas', String(plantilla.id));
  fs.mkdirSync(carpeta, { recursive: true });

  const yaTieneDiagramas = db.prepare('SELECT COUNT(*) AS n FROM plantilla_diagramas WHERE plantilla_id = ?').get(plantilla.id).n;
  if (yaTieneDiagramas > 0) {
    console.log(`La plantilla Tolva DT (id ${plantilla.id}) ya tiene ${yaTieneDiagramas} diagramas; no se duplicaron.`);
  } else {
    const insertarDiag = db.prepare(
      'INSERT INTO plantilla_diagramas (plantilla_id, nombre, archivo, orden) VALUES (?, ?, ?, ?)'
    );
    db.transaction(() => {
      DIAGRAMAS.forEach((d, i) => {
        const origen = path.join(__dirname, 'seed-assets', 'tolva-dt', d.asset);
        const destino = path.join(carpeta, d.asset);
        if (!fs.existsSync(destino)) fs.copyFileSync(origen, destino);
        insertarDiag.run(plantilla.id, d.nombre, d.asset, i);
      });
    })();
    console.log(`Diagramas: ${DIAGRAMAS.length} cargados en la plantilla Tolva DT (id ${plantilla.id}).`);
  }

  // --- 2) Zonas (catálogo de sectores) ---
  const yaTieneZonas = db.prepare('SELECT COUNT(*) AS n FROM zonas WHERE plantilla_id = ?').get(plantilla.id).n;
  if (yaTieneZonas > 0) {
    console.log(`La plantilla Tolva DT ya tiene ${yaTieneZonas} zonas; no se duplicó el catálogo.`);
  } else {
    const insertarZona = db.prepare(
      `INSERT INTO zonas (plantilla_id, sistema, sector, codigo, descripcion, criticidad_base)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    let total = 0;
    db.transaction(() => {
      for (const [sector, partes] of Object.entries(SECTORES)) {
        for (const parte of partes) {
          insertarZona.run(plantilla.id, SISTEMA, sector, parte, null, null);
          total++;
        }
      }
    })();
    console.log(`Zonas: ${total} sectores de "${SISTEMA}" cargados en la plantilla Tolva DT (id ${plantilla.id}).`);
  }

  console.log('Seed Tolva DT listo.');
}

module.exports = { seed };

if (require.main === module) seed(require('./index'));
