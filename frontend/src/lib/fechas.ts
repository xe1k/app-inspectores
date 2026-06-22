// Formateo de timestamps para mostrar al usuario. Todo se almacena en UTC
// (ISO 8601) y se presenta en hora local de Chile, sin librerías externas.
const TZ = 'America/Santiago';

function partes(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const obtener = (opciones: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-CL', { timeZone: TZ, ...opciones }).format(d);
  return {
    diaSemana: obtener({ weekday: 'long' }),
    dia: obtener({ day: 'numeric' }),
    mesLargo: obtener({ month: 'long' }),
    mesCorto: obtener({ month: 'short' }).replace('.', ''),
    anio: obtener({ year: 'numeric' }),
    hora: obtener({ hour: '2-digit', minute: '2-digit', hour12: false }),
    horaConSegundos: obtener({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  };
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Jueves 11 de junio de 2026, 14:32" */
export function fechaHoraLarga(iso: string | null | undefined) {
  if (!iso) return null;
  const p = partes(iso);
  if (!p) return null;
  return `${capitalizar(p.diaSemana)} ${p.dia} de ${p.mesLargo} de ${p.anio}, ${p.hora}`;
}

/** "Jueves 11 jun 2026 · 14:32:07" */
export function fechaHoraCorta(iso: string | null | undefined) {
  if (!iso) return null;
  const p = partes(iso);
  if (!p) return null;
  return `${capitalizar(p.diaSemana)} ${p.dia} ${p.mesCorto} ${p.anio} · ${p.horaConSegundos}`;
}

/** "2h 13min" entre dos timestamps; null si falta alguno o es inválido */
export function duracionEntre(inicioIso: string | null | undefined, finIso: string | null | undefined) {
  if (!inicioIso || !finIso) return null;
  const ms = new Date(finIso).getTime() - new Date(inicioIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutos = Math.round(ms / 60000);
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** Fecha local de Chile en formato YYYY-MM-DD (para la columna `fecha` clásica) */
export function fechaLocalChile(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
}

/** "Hoy" / "Ayer" / "Hace 3 días" / "Hace 2 semanas" / "Hace 3 meses" / "Hace 1 año" */
export function tiempoRelativo(iso: string | null | undefined) {
  if (!iso) return '—';
  const fecha = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86400000);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  if (dias < 30) {
    const semanas = Math.floor(dias / 7);
    return `Hace ${semanas} semana${semanas > 1 ? 's' : ''}`;
  }
  if (dias < 365) {
    const meses = Math.floor(dias / 30);
    return `Hace ${meses} mes${meses > 1 ? 'es' : ''}`;
  }
  const anios = Math.floor(dias / 365);
  return `Hace ${anios} año${anios > 1 ? 's' : ''}`;
}
