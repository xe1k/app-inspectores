// Seed de las plantillas base 980E (Chasis) y Tolva DT, las dos primeras que
// se crearon a mano desde la app durante el desarrollo. A diferencia de
// seed-formatos.js (que arma WESTECH/797F/D10T), estas dos no estaban en ningún
// seed: este archivo las vuelve reproducibles para un despliegue limpio.
//
// La fuente de verdad es seed-base.json (snapshot exportado de la BD real:
// datos generales + páginas técnicas + lista de diagramas) y las imágenes en
// seed-assets/980e/ y seed-assets/tolva-dt/. Las zonas/sectores de cada modelo
// las cargan seed-zonas-980e.js y seed-tolva-dt.js.
//
// Ejecutar: node src/db/seed-base.js   (idempotente)
const fs = require('fs');
const path = require('path');

const SNAPSHOT = require('./seed-base.json');

// slug en seed-base.json -> carpeta de imágenes en seed-assets/
const CARPETA_ASSETS = {
  '980e': '980e',
  'tolva-dt': 'tolva-dt',
};

function seed(db) {
  const creador = db.prepare('SELECT id FROM usuarios ORDER BY id LIMIT 1').get();
  if (!creador) {
    console.log('seed-base: no hay usuarios todavía; se omite (crea el admin primero).');
    return;
  }

  const findPlantilla = db.prepare('SELECT id FROM plantillas_equipo WHERE modelo = ? ORDER BY id LIMIT 1');
  const insertPlantilla = db.prepare(
    `INSERT INTO plantillas_equipo (modelo, tipo, datos_generales_json, paginas_fijas_json, creado_por)
     VALUES (?, ?, ?, ?, ?)`
  );
  const countDiag = db.prepare('SELECT COUNT(*) AS n FROM plantilla_diagramas WHERE plantilla_id = ?');
  const insertDiag = db.prepare(
    'INSERT INTO plantilla_diagramas (plantilla_id, nombre, archivo, orden) VALUES (?, ?, ?, ?)'
  );

  for (const [slug, f] of Object.entries(SNAPSHOT)) {
    let plantilla = findPlantilla.get(f.modelo);
    if (!plantilla) {
      const info = insertPlantilla.run(
        f.modelo, f.tipo,
        JSON.stringify(f.datos_generales || {}),
        JSON.stringify(f.paginas_fijas || []),
        creador.id
      );
      plantilla = { id: info.lastInsertRowid };
      console.log(`seed-base: plantilla creada ${f.modelo} (${f.tipo}) -> id ${plantilla.id}`);
    } else {
      console.log(`seed-base: plantilla ${f.modelo} ya existe (id ${plantilla.id}).`);
    }

    // Diagramas: copiar las imágenes a data/plantillas/<id>/ y registrarlas.
    if (countDiag.get(plantilla.id).n > 0) {
      console.log(`  ${f.modelo}: ya tiene diagramas; no se duplicaron.`);
      continue;
    }
    const carpeta = path.join(db.dataDir, 'plantillas', String(plantilla.id));
    fs.mkdirSync(carpeta, { recursive: true });
    const assetDir = path.join(__dirname, 'seed-assets', CARPETA_ASSETS[slug]);
    db.transaction(() => {
      (f.diagramas || []).forEach((d) => {
        const origen = path.join(assetDir, d.archivo);
        const destino = path.join(carpeta, d.archivo);
        if (!fs.existsSync(destino)) fs.copyFileSync(origen, destino);
        insertDiag.run(plantilla.id, d.nombre, d.archivo, d.orden);
      });
    })();
    console.log(`  ${f.modelo}: ${(f.diagramas || []).length} diagramas cargados.`);
  }

  console.log('Seed base (980E + Tolva DT) listo.');
}

module.exports = { seed };

if (require.main === module) seed(require('./index'));
