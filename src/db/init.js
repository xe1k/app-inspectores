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

// Cuentas de prueba para la presentación. Cuando estén las cuentas reales
// de los 4 inspectores, se pueden agregar/editar desde la propia app o aquí.
const PRUEBA = [
  { username: 'inspector1@chaba.test', nombre: 'Inspector de prueba 1', clave: 'inspector123' },
  { username: 'demo@chaba.test', nombre: 'Cuenta demo', clave: 'demo1234' },
];

const total = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
if (total === 0) {
  const insertar = db.prepare(
    'INSERT INTO usuarios (username, nombre, password_hash) VALUES (?,?,?)'
  );
  for (const u of PRUEBA) {
    insertar.run(u.username, u.nombre, bcrypt.hashSync(u.clave, 10));
    console.log(`Usuario de prueba creado -> ${u.username} / ${u.clave}`);
  }
  console.log('IMPORTANTE: estas son cuentas de prueba para la presentación.');
  console.log('Reemplázalas por las cuentas reales de los inspectores antes de usar la app en terreno.');
} else {
  console.log('La base ya tenía usuarios, no se crearon cuentas de prueba.');
}

console.log('Base de datos lista.');
db.close();
