// Conexión única a la base de datos SQLite.
// El archivo de datos vive en data/inspecciones.db (fácil de respaldar).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATA_DIR permite apuntar la base y los archivos a otra carpeta (útil para
// pruebas con una BD limpia). Sin la variable, usa data/ como siempre.
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'inspecciones.db'));
db.pragma('journal_mode = WAL');   // mejor concurrencia (varios inspectores a la vez)
db.pragma('foreign_keys = ON');

db.dataDir = dataDir;   // expuesto para que seeds/rutas resuelvan archivos coherentemente

module.exports = db;
