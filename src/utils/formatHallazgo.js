// Formateo de tiempo de reparación (siempre HORAS) y recursos (siempre
// PERSONAS) de un hallazgo. Versión CommonJS para el backend/PDF.
// Mantener en sincronía con frontend/src/lib/formatHallazgo.ts.
//
// Tolera datos históricos: las columnas guardaban texto compuesto
// ("12 hrs", "2 personas", "2 soldadores, repuesto X"), por lo que se
// extrae el número inicial. Desde 2026-06-12 se guardan enteros puros.

function parseCantidad(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const m = String(v).trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// "1 hora" | "12 horas" | "No especificado" (0, null o texto sin número)
function formatHoras(v) {
  const n = parseCantidad(v);
  if (n == null || n === 0) return 'No especificado';
  return n === 1 ? '1 hora' : `${n} horas`;
}

// "1 persona" | "3 personas" | "No especificado"
function formatPersonas(v) {
  const n = parseCantidad(v);
  if (n == null || n === 0) return 'No especificado';
  return n === 1 ? '1 persona' : `${n} personas`;
}

module.exports = { parseCantidad, formatHoras, formatPersonas };
