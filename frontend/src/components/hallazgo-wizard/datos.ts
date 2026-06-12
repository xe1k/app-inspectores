// Catálogos del wizard de nuevo hallazgo. El inspector toca, no escribe:
// estos valores se guardan como texto en las columnas existentes de SQLite
// (sistema, sector, tipo_dano), por lo que el esquema no cambia.

export const TIPOS_DANO = [
  'Fisura',
  'Corrosión',
  'Deformación',
  'Desgaste',
  'Fractura',
  'Soldadura dañada',
  'Perno suelto / faltante',
  'Otro',
] as const;

export const SISTEMAS = [
  'Chasis',
  'Tolva',
  'Sub-chasis',
  'Axle Box',
  'Horse Collar',
  'Alerones',
  'Suspensión',
  'Otro',
] as const;

export const SECTORES_POR_SISTEMA: Record<string, string[]> = {
  Chasis: [
    'Bastidor derecho',
    'Bastidor izquierdo',
    'Zona central',
    'Parante delantero',
    'Parante trasero',
    'Torre de suspensión',
    'Cola del bastidor',
    'Otro',
  ],
  Tolva: [
    'Bastidor',
    'Piso',
    'Pared lateral derecha',
    'Pared lateral izquierda',
    'Pared frontal',
    'Visera',
    'Rieles',
    'Otro',
  ],
  'Sub-chasis': ['Lado derecho', 'Lado izquierdo', 'Travesaño', 'Soportes', 'Otro'],
  'Axle Box': ['Carcasa', 'Tapa', 'Soportes', 'Refuerzos', 'Otro'],
  'Horse Collar': ['Lado derecho', 'Lado izquierdo', 'Zona central', 'Otro'],
  Alerones: ['Alerón derecho', 'Alerón izquierdo', 'Soportes', 'Otro'],
  Suspensión: [
    'Delantera derecha',
    'Delantera izquierda',
    'Trasera derecha',
    'Trasera izquierda',
    'Otro',
  ],
};

export interface DatosHallazgo {
  criticidad: 'alta' | 'media' | 'baja' | null;
  tipoDano: string | null;
  tipoDanoOtro: string;
  zonaId: number | null; // id del catálogo `zonas` cuando la plantilla lo tiene
  sistema: string;
  sistemaOtro: string;
  sector: string;
  sectorOtro: string;
  codigo: string;
  tiempoHrs: string; // horas (entero como texto del input)
  recursosCantidad: string; // personas (entero como texto del input)
  preexistencia: 'si' | 'no' | null;
  fotos: { archivo: File; preview: string }[];
}

export const DATOS_INICIALES: DatosHallazgo = {
  criticidad: null,
  tipoDano: null,
  tipoDanoOtro: '',
  zonaId: null,
  sistema: '',
  sistemaOtro: '',
  sector: '',
  sectorOtro: '',
  codigo: '',
  tiempoHrs: '',
  recursosCantidad: '',
  preexistencia: null,
  fotos: [],
};

function enteroONull(texto: string, max: number): number | null {
  const n = Math.round(Number(texto.trim()));
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

// Valores finales que viajan al backend (mismas columnas de siempre)
export function aCuerpoApi(d: DatosHallazgo, inspeccionId: number) {
  const tipo = d.tipoDano === 'Otro' ? d.tipoDanoOtro.trim() : d.tipoDano;
  const sistema = d.sistema === 'Otro' ? d.sistemaOtro.trim() : d.sistema;
  const sector = d.sector === 'Otro' ? d.sectorOtro.trim() : d.sector;
  return {
    inspeccion_id: inspeccionId,
    criticidad: d.criticidad,
    tipo_dano: tipo || null,
    zona_id: d.zonaId,
    sistema: sistema || null,
    sector: sector || null,
    codigo: d.codigo.trim().toUpperCase() || null,
    // Enteros puros: tiempo SIEMPRE en horas, recursos SIEMPRE personas.
    tiempo_reparacion: enteroONull(d.tiempoHrs, 999),
    recursos: enteroONull(d.recursosCantidad, 99),
    preexistencia: d.preexistencia,
  };
}

// Etiquetas legibles para el resumen del paso 4
export function resumenUbicacion(d: DatosHallazgo) {
  const sistema = d.sistema === 'Otro' ? d.sistemaOtro.trim() : d.sistema;
  const sector = d.sector === 'Otro' ? d.sectorOtro.trim() : d.sector;
  return { sistema, sector };
}
