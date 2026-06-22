// Inicializa el esquema y crea cuentas de inspectores de prueba.
// Ejecutar con: npm run init-db
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./index');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migración liviana: agrega columnas nuevas a tablas que ya existían sin ellas.
const columnasInspecciones = db.prepare('PRAGMA table_info(inspecciones)').all().map(c => c.name);
if (!columnasInspecciones.includes('foto_portada')) {
  db.exec('ALTER TABLE inspecciones ADD COLUMN foto_portada TEXT');
  console.log('Migración: agregada columna inspecciones.foto_portada');
}
if (!columnasInspecciones.includes('inspeccion_base_id')) {
  db.exec('ALTER TABLE inspecciones ADD COLUMN inspeccion_base_id INTEGER REFERENCES inspecciones(id)');
  console.log('Migración: agregada columna inspecciones.inspeccion_base_id');
}

const columnasHallazgos = db.prepare('PRAGMA table_info(hallazgos)').all().map(c => c.name);
if (!columnasHallazgos.includes('hallazgo_origen_id')) {
  db.exec('ALTER TABLE hallazgos ADD COLUMN hallazgo_origen_id INTEGER REFERENCES hallazgos(id)');
  db.exec('ALTER TABLE hallazgos ADD COLUMN estado_revision TEXT');
  db.exec('ALTER TABLE hallazgos ADD COLUMN nota_revision TEXT');
  console.log('Migración: agregadas columnas de revisión guiada en hallazgos');
}
if (!columnasHallazgos.includes('tipo_dano')) {
  db.exec('ALTER TABLE hallazgos ADD COLUMN tipo_dano TEXT');
  console.log('Migración: agregada columna hallazgos.tipo_dano');
}
if (!columnasHallazgos.includes('zona_id')) {
  db.exec('ALTER TABLE hallazgos ADD COLUMN zona_id INTEGER REFERENCES zonas(id)');
  console.log('Migración: agregada columna hallazgos.zona_id');
}
if (!columnasHallazgos.includes('estado')) {
  // Ciclo de vida: los hallazgos existentes quedan como 'detectado'.
  db.exec("ALTER TABLE hallazgos ADD COLUMN estado TEXT NOT NULL DEFAULT 'detectado'");
  db.exec('ALTER TABLE hallazgos ADD COLUMN fecha_estado_cambio TEXT');
  db.exec('ALTER TABLE hallazgos ADD COLUMN usuario_estado TEXT');
  console.log('Migración: agregadas columnas de ciclo de vida en hallazgos');
}

if (!columnasHallazgos.includes('fecha_creacion')) {
  db.exec('ALTER TABLE hallazgos ADD COLUMN fecha_creacion TEXT');
  db.exec('ALTER TABLE hallazgos ADD COLUMN fecha_actualizacion TEXT');
  console.log('Migración: agregadas columnas de timestamps en hallazgos');
}

const columnasInsp2 = db.prepare('PRAGMA table_info(inspecciones)').all().map(c => c.name);
if (!columnasInsp2.includes('fecha_inicio')) {
  // Registro automático de tiempo y ubicación. Los registros existentes
  // quedan con NULL (el PDF cae a la columna "fecha" de siempre).
  db.exec('ALTER TABLE inspecciones ADD COLUMN fecha_inicio TEXT');
  db.exec('ALTER TABLE inspecciones ADD COLUMN fecha_cierre TEXT');
  db.exec('ALTER TABLE inspecciones ADD COLUMN latitud REAL');
  db.exec('ALTER TABLE inspecciones ADD COLUMN longitud REAL');
  db.exec('ALTER TABLE inspecciones ADD COLUMN precision_gps REAL');
  db.exec('ALTER TABLE inspecciones ADD COLUMN ubicacion_nombre TEXT');
  console.log('Migración: agregadas columnas de timestamps y GPS en inspecciones');
}

if (!columnasInsp2.includes('firmada')) {
  // Firma digital: las inspecciones existentes quedan sin firma (firmada=0).
  // Las completadas antiguas se muestran como "Completada (sin firma digital)".
  db.exec("ALTER TABLE inspecciones ADD COLUMN firmada INTEGER NOT NULL DEFAULT 0");
  db.exec('ALTER TABLE inspecciones ADD COLUMN firma_usuario_id INTEGER REFERENCES usuarios(id)');
  db.exec('ALTER TABLE inspecciones ADD COLUMN firma_timestamp TEXT');
  db.exec('ALTER TABLE inspecciones ADD COLUMN firma_hash TEXT');
  console.log('Migración: agregadas columnas de firma digital en inspecciones');
}

const columnasUsuarios = db.prepare('PRAGMA table_info(usuarios)').all().map(c => c.name);
if (!columnasUsuarios.includes('rol')) {
  db.exec("ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'inspector'");
  // La cuenta demo queda como supervisor para poder probar /seguimiento;
  // promover a los supervisores reales con:
  //   UPDATE usuarios SET rol = 'supervisor' WHERE username = '<correo>';
  db.prepare("UPDATE usuarios SET rol = 'supervisor' WHERE username = 'demo@chaba.test'").run();
  console.log("Migración: agregada columna usuarios.rol (demo@chaba.test quedó como supervisor)");
}

if (!columnasUsuarios.includes('nombre_completo')) {
  // Identidad para la firma digital. nombre_completo parte como copia del
  // nombre de siempre; cada inspector lo afina desde /perfil.
  db.exec("ALTER TABLE usuarios ADD COLUMN nombre_completo TEXT NOT NULL DEFAULT ''");
  db.exec('ALTER TABLE usuarios ADD COLUMN rut TEXT');
  db.exec('ALTER TABLE usuarios ADD COLUMN cargo TEXT');
  db.exec('ALTER TABLE usuarios ADD COLUMN firma_imagen TEXT');
  db.exec('ALTER TABLE usuarios ADD COLUMN pin_hash TEXT');
  db.prepare("UPDATE usuarios SET nombre_completo = nombre WHERE nombre_completo = ''").run();
  console.log('Migración: agregadas columnas de identidad y firma en usuarios');
}

// Índices para las consultas del dashboard gerencial (no destructivos).
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_hallazgos_estado ON hallazgos(estado);
  CREATE INDEX IF NOT EXISTS idx_hallazgos_criticidad ON hallazgos(criticidad);
  CREATE INDEX IF NOT EXISTS idx_hallazgos_fecha_creacion ON hallazgos(fecha_creacion);
  CREATE INDEX IF NOT EXISTS idx_inspecciones_estado ON inspecciones(estado);
  CREATE INDEX IF NOT EXISTS idx_inspecciones_fecha_inicio ON inspecciones(fecha_inicio);
`);

// ── 1) Administrador ──────────────────────────────────────────────────────
// El admin se crea desde variables de entorno (ADMIN_USERNAME, ADMIN_PASSWORD,
// ADMIN_NOMBRE). En producción es obligatorio: sin admin no hay forma de entrar
// a gestionar usuarios. Idempotente: si la cuenta ya existe, solo se asegura el
// rol; si no hay variables y ya hay un admin, no se toca nada.
const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NOMBRE } = process.env;
const hayAdmin = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1").get().n;

if (ADMIN_USERNAME && ADMIN_PASSWORD) {
  const existente = db.prepare('SELECT id, rol FROM usuarios WHERE username = ?').get(ADMIN_USERNAME);
  const nombre = (ADMIN_NOMBRE || 'Administrador').trim();
  if (!existente) {
    db.prepare(
      `INSERT INTO usuarios (username, nombre, nombre_completo, password_hash, rol)
       VALUES (?, ?, ?, ?, 'admin')`
    ).run(ADMIN_USERNAME, nombre, nombre, bcrypt.hashSync(ADMIN_PASSWORD, 10));
    console.log(`Administrador creado -> ${ADMIN_USERNAME}`);
  } else if (existente.rol !== 'admin') {
    db.prepare("UPDATE usuarios SET rol = 'admin', activo = 1 WHERE id = ?").run(existente.id);
    console.log(`Usuario ${ADMIN_USERNAME} promovido a administrador.`);
  } else {
    console.log(`Administrador ${ADMIN_USERNAME} ya existe; sin cambios.`);
  }
} else if (process.env.NODE_ENV === 'production' && !hayAdmin) {
  console.error('ERROR: en producción debes definir ADMIN_USERNAME y ADMIN_PASSWORD para crear el administrador.');
  console.error('Configúralos con: fly secrets set ADMIN_USERNAME=... ADMIN_PASSWORD=... ADMIN_NOMBRE="..."');
  db.close();
  process.exit(1);
}

// ── 2) Cuentas de prueba (solo desarrollo) ────────────────────────────────
// Útiles para clonar el repo y probar localmente sin configurar variables.
// En producción NUNCA se crean.
if (process.env.NODE_ENV !== 'production') {
  const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (total === 0) {
    const PRUEBA = [
      { username: 'inspector1@chaba.test', nombre: 'Inspector de prueba 1', clave: 'inspector123' },
      { username: 'demo@chaba.test', nombre: 'Cuenta demo', clave: 'demo1234' },
    ];
    const insertar = db.prepare(
      'INSERT INTO usuarios (username, nombre, nombre_completo, password_hash) VALUES (?,?,?,?)'
    );
    for (const u of PRUEBA) {
      insertar.run(u.username, u.nombre, u.nombre, bcrypt.hashSync(u.clave, 10));
      console.log(`Usuario de prueba creado -> ${u.username} / ${u.clave}`);
    }
  }
}

// ── 3) Datos de referencia (plantillas, diagramas y zonas) ────────────────
// Idempotentes: cada seed verifica existencia antes de insertar. seed-base crea
// las plantillas 980E y Tolva DT; seed-formatos crea WESTECH/797F/D10T; los de
// zonas completan los catálogos de sectores. Necesitan al menos un usuario
// (creado arriba) porque plantillas_equipo.creado_por referencia usuarios(id).
for (const s of ['./seed-base', './seed-formatos', './seed-tolva-dt', './seed-zonas-980e']) {
  try {
    require(s).seed(db);
  } catch (e) {
    console.error(`Seed ${s} falló: ${e.message}`);
  }
}

console.log('Base de datos lista.');
db.close();
