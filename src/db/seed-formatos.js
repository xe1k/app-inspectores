// Seed de las plantillas Tolva WESTECH, Chasis 797F y Chasis D10T, replicando
// la estructura del 980E/Tolva DT: crea la plantilla si no existe (datos
// generales + páginas técnicas), carga sus diagramas (imágenes embebidas del
// PPT, en seed-assets/<slug>/) y siembra el catálogo de sectores.
//
// Como en la Tolva DT, estos modelos NO traen códigos alfanuméricos de zona:
// el campo `zonas.codigo` guarda el nombre descriptivo del sector/parte.
// El catálogo del 797F se limpió a mano (el PPT venía en traducción automática
// tosca del inglés); sus diagramas numerados quedan como referencia visual.
//
// Ejecutar: node src/db/seed-formatos.js   (idempotente)
const fs = require('fs');
const path = require('path');

const METODO = {
  titulo: 'Método de inspección',
  contenido:
    'Inspección visual con apoyo de ensayos no destructivos según corresponda al sector evaluado: tintas penetrantes (PT), yugo magnético / partículas magnéticas (MT) y ultrasonido para medición de espesores (UT).\n\n' +
    'Antes de inspeccionar, limpiar la zona a evaluar. Registrar cada fisura o daño encontrado con su fotografía, dimensión y el sector correspondiente, según las áreas indicadas en los diagramas de referencia de esta plantilla.\n\n' +
    'Equipos utilizados: tintas penetrantes Magnaflux · yugo magnético Yugo Y-2 / Magnaflux · ultrasonido Meldic modelo TM210 PLUS.',
};

const FORMATOS = [
  {
    modelo: 'Tolva WESTECH',
    tipo: 'Tolva',
    slug: 'tolva-westech',
    datos_generales: {
      Fabricante: 'WESTECH',
      'Tipo de equipo': 'Tolva',
      'Lugar de inspección habitual': 'Taller',
      'PSGCC aplicables': 'Hipoacusia, Sílice, Trabajo en altura',
      'END tintas penetrantes (modelo/marca)': 'Magnaflux',
      'END yugo magnético (modelo/marca)': 'Yugo Y-2 / Magnaflux',
      'END ultrasonido — espesores (modelo/marca)': 'Meldic, modelo TM210 PLUS',
    },
    paginas_extra: [
      {
        titulo: 'Sistemas y subsistemas de la tolva WESTECH',
        contenido:
          'La tolva WESTECH se inspecciona por estos sistemas: Visera, Front, Piso, Lateral, Vigas transversales, Vigas chasis y Basculantes. Cada uno con sus subsistemas (vigas, planchas, refuerzos, soldaduras), disponibles en el selector de sectores al registrar un hallazgo.',
      },
    ],
    diagramas: [
      { asset: 'westech_general.png', nombre: 'Vista general de la tolva — WESTECH' },
      { asset: 'westech_sectores.png', nombre: 'Sectores — vista interior' },
      { asset: 'westech_vigas_superior.png', nombre: 'Vigas y chasis — vista superior' },
      { asset: 'westech_cola_chasis.png', nombre: 'Cola de pato y vigas chasis' },
    ],
    sistema: 'Tolva',
    sectores: {
      'Visera tolva': [
        'Deflector de rocas (der. & izq.)', 'Vigas visera (der. & izq.)', 'Vigas centrales (der. & izq.)',
        'Tapa frontal', 'Ángulo unión front', 'Vigas pistola unión lateral (der. & izq.)',
      ],
      'Front tolva': [
        'Consolas (der. & izq.)', 'Vigas frontales (der. & izq.)', 'Planchas front (der. & izq.)',
        'Vigas diagonales', 'Unión front-piso', 'Vigas unión front-lateral (der. & izq.)',
      ],
      'Piso tolva': [
        'Plancha de piso unión front', 'Plancha de piso central', 'Plancha de piso cola de pato',
        'Blindaje cola de pato', 'Blindaje refuerzo base cilindro de levante (der. & izq.)',
        'Corta flujos lateral', 'Corta flujo piso unión front',
      ],
      'Lateral': [
        'Plancha lateral (der. & izq.)', 'Vigas superiores refuerzo (der. & izq.)',
        'Vigas intermedias (der. & izq.)', 'Vigas verticales refuerzo (der. & izq.)',
        'Viga unión lateral cola de pato (der. & izq.)',
      ],
      'Vigas transversales': [
        'Vigas transversales centrales', 'Vigas transversales exteriores (der. & izq.)',
        'Base cilindro de levante', 'Vigas longerinas centrales', 'Vigas cola de pato',
      ],
      'Vigas chasis': [
        'Vigas chasis (der. & izq.)', 'Orejas pivote', 'Caja hidráulica cilindro de levante (der. & izq.)',
        'Refuerzo orejas pivote', 'Tapas de vigas', 'Vigas chasis cola de pato', 'PAD de tolva',
      ],
      'Basculantes': ['Ajuste PAD'],
    },
  },

  {
    modelo: 'Chasis 797F',
    tipo: 'Chasis',
    slug: 'chasis-797f',
    datos_generales: {
      Fabricante: 'Caterpillar',
      'Modelo de chasis': '797F',
      'Lugar de inspección habitual': 'Taller',
      'PSGCC aplicables': 'Hipoacusia, Sílice, Trabajo en altura',
      'END tintas penetrantes (modelo/marca)': 'Magnaflux',
      'END yugo magnético (modelo/marca)': 'Yugo Y-2 / Magnaflux',
      'END ultrasonido — espesores (modelo/marca)': 'Meldic, modelo TM210 PLUS',
    },
    paginas_extra: [
      {
        titulo: 'Sistemas y subsistemas del chasis 797F',
        contenido:
          'El chasis 797F se inspecciona por: Soportes y fundiciones, Pedestales, Carriles (rails), Vigas, Suspensión y cilindros, Tanques, y Soldaduras estructurales. Los diagramas de referencia muestran cada punto numerado del informe original.',
      },
    ],
    diagramas: [
      { asset: 'c797f_vista_general.png', nombre: 'Chasis 797F — vista general (ítems 1-17)' },
      { asset: 'c797f_vista_posterior.png', nombre: 'Chasis 797F — vista posterior (ítems 18-23)' },
      { asset: 'c797f_vista_complementaria.png', nombre: 'Chasis 797F — vista complementaria' },
    ],
    sistema: 'Chasis',
    sectores: {
      'Soportes y fundiciones': [
        'Soporte HR (cola de fundición)', 'Soporte trasero', 'Soporte LH (reparto de cola)',
        'Soporte motor (fundición)', 'Conjunto soporte (caja de dirección)', 'Cuatro brazos de fundición (LH & RH)',
      ],
      'Pedestales': [
        'Pedestal frente derecho (RH)', 'Pedestal frente izquierdo (LH)', 'Montaje pedestal posterior (LH & RH)',
      ],
      'Carriles (rails)': [
        'Carril delantero RH', 'Carril delantero LH', 'Carril trasero derecho', 'Carril trasero izquierdo',
      ],
      'Vigas': [
        'Viga principal del conjunto', 'Viga proa/popa (Fore/aft beam, LH & RH)',
        'Soporte centro tubo transversal', 'Frente tubo transversal',
      ],
      'Suspensión y cilindros': [
        'Cilindro de suspensión delantero (LH & RH)', 'Soporte cilindro polipasto (LH & RH)',
      ],
      'Tanques': [
        'Soporte tanque de combustible (frente y trasero)', 'Soporte tanque hidráulico (frente y trasero)',
      ],
      'Soldaduras estructurales': [
        'Soldaduras placa tipo ventana', 'Soldadura rail a fundición (sup. e inf., ambos lados)',
        'Filete de soldadura tubo de torsión (ambos lados)', 'Soldaduras alrededor tubo de torsión y montajes',
        'Soldaduras polipasto (forja, ambos lados)', 'Soldaduras viga a reparto (ambos lados)',
        'Transiciones de colada (ambos lados)',
      ],
    },
  },

  {
    modelo: 'Chasis D10T',
    tipo: 'Chasis',
    slug: 'chasis-d10t',
    datos_generales: {
      Fabricante: 'Caterpillar',
      'Modelo de chasis': 'D10T',
      'Tipo de equipo': 'Bulldozer',
      'Lugar de inspección habitual': 'Taller',
      'PSGCC aplicables': 'Hipoacusia, Sílice, Trabajo en altura',
      'END tintas penetrantes (modelo/marca)': 'Magnaflux',
      'END yugo magnético (modelo/marca)': 'Yugo Y-2 / Magnaflux',
      'END ultrasonido — espesores (modelo/marca)': 'Meldic, modelo TM210 PLUS',
    },
    paginas_extra: [
      {
        titulo: 'Sectores del chasis D10T',
        contenido:
          'El chasis del D10T se inspecciona por: Bastidor, Hoja topadora (dozer), Ripper, Brazos de empuje, y Estructura y soportes. Los diagramas de referencia (bastidor, mando final y sección oscilante) muestran los puntos numerados del informe original.',
      },
    ],
    diagramas: [
      { asset: 'd10t_bastidor_general.png', nombre: 'Bastidor D10T — vista general' },
      { asset: 'd10t_mando_final.png', nombre: 'Bastidor D10T — mando final y eje trasero' },
      { asset: 'd10t_seccion_oscilante.png', nombre: 'Bastidor D10T — sección oscilante' },
    ],
    sistema: 'Chasis',
    sectores: {
      'Bastidor': [
        'Bastidor sector inferior izquierdo', 'Bastidor sector inferior derecho', 'Bastidor sector superior',
        'Travesaños', 'Socavación de bastidor',
      ],
      'Hoja topadora (Dozer)': [
        'Hoja (dozer)', 'Lateral dozer izquierdo', 'Lateral dozer derecho', 'Canilleras', 'Cantonera', 'Gousset',
      ],
      'Ripper': ['Pasador de seguro ripper', 'Soporte ripper', 'Vástago ripper'],
      'Brazos de empuje': ['Brazo de empuje izquierdo', 'Brazo de empuje derecho', 'Rótula / unión'],
      'Estructura y soportes': ['Soporte', 'Protección de radiador', 'Parante', 'Estructura ROPS / cabina'],
    },
  },
];

function seed(db) {
  const creador = db.prepare('SELECT id FROM usuarios ORDER BY id LIMIT 1').get();
  if (!creador) {
    console.log('seed-formatos: no hay usuarios todavía; se omite (crea el admin primero).');
    return;
  }
  const CREADO_POR = creador.id;

  const findPlantilla = db.prepare('SELECT id FROM plantillas_equipo WHERE modelo = ? LIMIT 1');
  const insertPlantilla = db.prepare(
    `INSERT INTO plantillas_equipo (modelo, tipo, datos_generales_json, paginas_fijas_json, creado_por)
     VALUES (?, ?, ?, ?, ?)`
  );
  const countDiag = db.prepare('SELECT COUNT(*) AS n FROM plantilla_diagramas WHERE plantilla_id = ?');
  const insertDiag = db.prepare('INSERT INTO plantilla_diagramas (plantilla_id, nombre, archivo, orden) VALUES (?, ?, ?, ?)');
  const countZonas = db.prepare('SELECT COUNT(*) AS n FROM zonas WHERE plantilla_id = ?');
  const insertZona = db.prepare(
    'INSERT INTO zonas (plantilla_id, sistema, sector, codigo, descripcion, criticidad_base) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const f of FORMATOS) {
    let plantilla = findPlantilla.get(f.modelo);
    if (!plantilla) {
      const paginas = [METODO, ...(f.paginas_extra || [])];
      const info = insertPlantilla.run(
        f.modelo, f.tipo, JSON.stringify(f.datos_generales), JSON.stringify(paginas), CREADO_POR
      );
      plantilla = { id: info.lastInsertRowid };
      console.log(`Plantilla creada: ${f.modelo} (${f.tipo}) -> id ${plantilla.id}`);
    } else {
      console.log(`Plantilla ${f.modelo} ya existe (id ${plantilla.id}).`);
    }

    // Diagramas
    if (countDiag.get(plantilla.id).n > 0) {
      console.log(`  ${f.modelo}: ya tiene diagramas; no se duplicaron.`);
    } else {
      const carpeta = path.join(db.dataDir, 'plantillas', String(plantilla.id));
      fs.mkdirSync(carpeta, { recursive: true });
      db.transaction(() => {
        f.diagramas.forEach((d, i) => {
          const origen = path.join(__dirname, 'seed-assets', f.slug, d.asset);
          const destino = path.join(carpeta, d.asset);
          if (!fs.existsSync(destino)) fs.copyFileSync(origen, destino);
          insertDiag.run(plantilla.id, d.nombre, d.asset, i);
        });
      })();
      console.log(`  ${f.modelo}: ${f.diagramas.length} diagramas cargados.`);
    }

    // Zonas
    if (countZonas.get(plantilla.id).n > 0) {
      console.log(`  ${f.modelo}: ya tiene zonas; no se duplicó el catálogo.`);
    } else {
      let total = 0;
      db.transaction(() => {
        for (const [sector, partes] of Object.entries(f.sectores)) {
          for (const parte of partes) {
            insertZona.run(plantilla.id, f.sistema, sector, parte, null, null);
            total++;
          }
        }
      })();
      console.log(`  ${f.modelo}: ${total} zonas en ${Object.keys(f.sectores).length} sectores.`);
    }
  }

  console.log('Seed de formatos listo.');
}

module.exports = { seed };

if (require.main === module) seed(require('./index'));
