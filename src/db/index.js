// Conexión única a la base de datos SQLite.
// El archivo de datos vive en data/inspecciones.db (fácil de respaldar).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'inspecciones.db'));
db.pragma('journal_mode = WAL');   // mejor concurrencia (varios inspectores a la vez)
db.pragma('foreign_keys = ON');

module.exports = db;
