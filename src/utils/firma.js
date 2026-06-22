// Firma digital de inspecciones: hash de integridad y control de intentos de PIN.
//
// El hash SHA-256 congela el contenido DECLARADO EN TERRENO al momento de
// firmar (ver el SELECT explícito más abajo). Cualquier cambio en lo declarado
// (descripción, criticidad, hallazgos agregados/quitados, cabecera) rompe el
// hash; los campos administrados después de firmar (fecha_actualizacion) no
// entran en el cálculo.
const crypto = require('crypto');
const db = require('../db');

function calcularHashFirma(inspeccionId, firmaUsuarioId, firmaTimestamp) {
  const insp = db.prepare(
    'SELECT id, equipo, ot, fecha_inicio, horometro FROM inspecciones WHERE id = ?'
  ).get(inspeccionId);
  if (!insp) return null;

  // Orden por id y columnas explícitas: el JSON resultante es determinista
  // (better-sqlite3 respeta el orden de columnas del SELECT).
  const hallazgos = db.prepare(
    `SELECT id, numero, sistema, sector, codigo, criticidad, tipo_dano,
            descripcion_dano, trabajo_realizar, recomendacion, tiempo_reparacion,
            recursos, preexistencia, zona_id, hallazgo_origen_id, estado_revision,
            nota_revision, fecha_creacion
     FROM hallazgos WHERE inspeccion_id = ? ORDER BY id`
  ).all(inspeccionId);

  const contenido = {
    inspeccion_id: insp.id,
    equipo: insp.equipo,
    ot: insp.ot,
    fecha_inicio: insp.fecha_inicio,
    horometro: insp.horometro,
    hallazgos,
    firma_usuario_id: firmaUsuarioId,
    firma_timestamp: firmaTimestamp
  };
  return crypto.createHash('sha256').update(JSON.stringify(contenido)).digest('hex');
}

// ---- Bloqueo por intentos fallidos de PIN -------------------------------
// 5 fallos consecutivos => bloqueo de 5 minutos. En memoria por usuario:
// suficiente para frenar adivinanza de un PIN de 4 dígitos en esta app
// interna (se reinicia con el servidor, igual que las sesiones activas).
const MAX_FALLOS = 5;
const BLOQUEO_MS = 5 * 60 * 1000;
const intentos = new Map(); // usuario_id -> { fallos, bloqueadoHasta }

// Minutos restantes de bloqueo (0 si puede intentar).
function minutosBloqueoPin(usuarioId) {
  const e = intentos.get(usuarioId);
  if (!e || !e.bloqueadoHasta || e.bloqueadoHasta <= Date.now()) return 0;
  return Math.ceil((e.bloqueadoHasta - Date.now()) / 60000);
}

// Registra un fallo; devuelve true si este fallo activó el bloqueo.
function registrarFalloPin(usuarioId) {
  const e = intentos.get(usuarioId) || { fallos: 0, bloqueadoHasta: 0 };
  e.fallos += 1;
  if (e.fallos >= MAX_FALLOS) {
    e.fallos = 0;
    e.bloqueadoHasta = Date.now() + BLOQUEO_MS;
  }
  intentos.set(usuarioId, e);
  return e.bloqueadoHasta > Date.now();
}

function limpiarFallosPin(usuarioId) {
  intentos.delete(usuarioId);
}

module.exports = { calcularHashFirma, minutosBloqueoPin, registrarFalloPin, limpiarFallosPin };
