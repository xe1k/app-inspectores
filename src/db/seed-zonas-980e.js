// Seed de zonas técnicas del modelo 980E Chasis, extraídas del diagrama real.
// Ejecutar con: node src/db/seed-zonas-980e.js
// Es idempotente: si la plantilla ya tiene zonas, no hace nada.
const db = require('./index');

const SISTEMA = 'Chasis principal';

const SECTORES = {
  'LH Side — exterior izquierdo': [
    'HC01LTO', 'HC02LBO', 'ZC01LHO', 'ZC02LHO', 'ZC03LHO', 'ZA01LHO',
    'ZM01LHO', 'ZM02LHO', 'ZB01LHO', 'BSR01LHO', 'BBE01F', 'BBE02R',
    'BSFF01LH', 'BTKH01', 'BTKH02', 'BTKH03', 'FSB01LH', 'PCH01', 'GT01LH', 'BD01LH',
  ],
  'LH Inside — interior izquierdo': [
    'HC01LTI', 'HC02LBI', 'ZC01LHI', 'ZC02LHI', 'ZC03LHI', 'ZA01LHI',
    'ZM01LHI', 'ZM02LHI', 'ZB01LHI', 'BSR02LHI', 'BPM01LH', 'BCT01LH',
    'BSFF01LH', 'HCW01LHI', 'HCW02LH', 'BSF01LHR', 'PT01LHI',
  ],
  'RH Side — exterior derecho': [
    'HC01LTO', 'HC02LBO', 'ZC04RHO', 'ZC05RHO', 'ZC06RHO', 'ZA02RHO',
    'ZM03RHO', 'ZM04RHO', 'ZB02RHO', 'BSR04RHO', 'HPCL02RH', 'BSFF02RH',
    'BTKC01', 'BTKC02', 'BTKC03', 'FSB02RH', 'PCH01', 'GT02RH', 'BD02RH',
  ],
  'RH Inside — interior derecho': [
    'HC01LTI', 'HC02LBI', 'ZC04RHI', 'ZC05RHI', 'ZA02RHI', 'ZM03RHI',
    'ZM04RHI', 'ZB02RHI', 'BSR03RHI', 'BPM02RH', 'BCT02RH', 'BSFF02RHR',
    'HCW03RHI', 'HCW04RHB', 'BSF02RHR', 'PT02RHI',
  ],
  'Top — vista superior': [
    'ZC01LHT', 'ZC02LHT', 'ZC03LHT', 'ZA01LHT', 'ZA02RHT', 'ZM01LHT',
    'ZM02LHT', 'ZM03RHT', 'ZM04RHT', 'ZB01LHT', 'ZB02RHT', 'ZC04RHT',
    'BSF01LHB', 'BSF02RHR', 'BSF03LHF', 'BSF04RHF', 'DTW01LH', 'DTW02RH',
    'DTW03LH', 'DTW04RH', 'HC01LTO', 'ZBDTF01', 'PCH01',
  ],
  'Bottom — vista inferior': [
    'ZC01LHB', 'ZC02LHB', 'ZC03LHB', 'ZA01LHB', 'ZA02RHB', 'ZM02LHB',
    'ZM03RHB', 'ZM04RHB', 'ZC04RHB', 'ZC05RHB', 'BD01LH', 'BD02RH',
    'HC02LBO', 'DTW01LH', 'DTW02RH', 'ZCDTM02', 'ZCDTR03', 'BSF01LHR',
  ],
};

// Descripciones por prefijo, tomadas de la tabla de ensayos no destructivos
// de la propia plantilla 980E (no inventadas). Los prefijos sin documentación
// quedan sin descripción hasta que el equipo técnico las complete.
const DESCRIPCIONES = [
  ['ZA', 'Zona de asentamiento PAD de tolva'],
  ['BTKH', 'Soporte TK hidráulico'],
  ['BTKC', 'Soporte TK combustible'],
  ['DTW', 'Soldadura Drive Tube chasis'],
  ['HCW', 'Soldadura Horse Collar'],
  ['HPCL', 'Hoist Pin cilindro de levante'],
  ['HC', 'Horse Collar'],
];

function descripcionPara(codigo) {
  // Probar primero los prefijos más largos (HC al final para no tapar HCW/HPCL)
  const fila = DESCRIPCIONES.find(([prefijo]) => codigo.startsWith(prefijo));
  return fila ? fila[1] : null;
}

// Criticidad sugerida por zona: solo las documentadas. Las zonas de
// asentamiento de tolva (ZA*) requieren UT anual -> sugerencia "alta".
function criticidadPara(codigo) {
  return codigo.startsWith('ZA') ? 'alta' : null;
}

const plantilla = db.prepare(
  "SELECT id, modelo, tipo FROM plantillas_equipo WHERE modelo LIKE '%980E%' ORDER BY id LIMIT 1"
).get();

if (!plantilla) {
  console.log('No se encontró una plantilla 980E; no se cargaron zonas.');
  process.exit(0);
}

const existentes = db.prepare('SELECT COUNT(*) AS n FROM zonas WHERE plantilla_id = ?').get(plantilla.id).n;
if (existentes > 0) {
  console.log(`La plantilla ${plantilla.modelo} (id ${plantilla.id}) ya tiene ${existentes} zonas; no se duplicó el seed.`);
  process.exit(0);
}

const insertar = db.prepare(
  `INSERT INTO zonas (plantilla_id, sistema, sector, codigo, descripcion, criticidad_base)
   VALUES (?, ?, ?, ?, ?, ?)`
);

let total = 0;
db.transaction(() => {
  for (const [sector, codigos] of Object.entries(SECTORES)) {
    for (const codigo of codigos) {
      insertar.run(plantilla.id, SISTEMA, sector, codigo, descripcionPara(codigo), criticidadPara(codigo));
      total++;
    }
  }
})();

console.log(`Seed listo: ${total} zonas de "${SISTEMA}" cargadas en la plantilla ${plantilla.modelo} ${plantilla.tipo} (id ${plantilla.id}).`);
