// Formateo de tiempo de reparación (siempre HORAS) y recursos (siempre
// PERSONAS) de un hallazgo. Versión ESM para React.
// Mantener en sincronía con src/utils/formatHallazgo.js (backend/PDF).
//
// Tolera datos históricos: las columnas guardaban texto compuesto
// ("12 hrs", "2 personas", "2 soldadores, repuesto X"), por lo que se
// extrae el número inicial. Desde 2026-06-12 se guardan enteros puros.

export function parseCantidad(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const m = String(v).trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** "1 hora" | "12 horas" | "No especificado" (0, null o texto sin número) */
export function formatHoras(v: number | string | null | undefined): string {
  const n = parseCantidad(v);
  if (n == null || n === 0) return 'No especificado';
  return n === 1 ? '1 hora' : `${n} horas`;
}

/** "1 persona" | "3 personas" | "No especificado" */
export function formatPersonas(v: number | string | null | undefined): string {
  const n = parseCantidad(v);
  if (n == null || n === 0) return 'No especificado';
  return n === 1 ? '1 persona' : `${n} personas`;
}
