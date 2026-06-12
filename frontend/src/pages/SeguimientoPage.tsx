import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import EstadoHallazgo, { infoEstado } from '@/components/EstadoHallazgo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import { parseCantidad } from '@/lib/formatHallazgo';

interface HallazgoAbierto {
  id: number;
  inspeccion_id: number;
  numero: number;
  criticidad: 'alta' | 'media' | 'baja' | string;
  estado: string;
  tipo_dano: string | null;
  sistema: string | null;
  sector: string | null;
  codigo: string | null;
  fecha_estado_cambio: string | null;
  creado_en: string;
  tiempo_reparacion: number | string | null;
  recursos: number | string | null;
  equipo: string;
  ot: string | null;
  inspector: string;
}

const ETIQUETAS_CRITICIDAD: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const ESTILOS_CRITICIDAD: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-green-100 text-green-700',
};
const ESTADOS_FILTRO = ['detectado', 'en_reparacion', 'resuelto'] as const;

function diasAbierto(h: HallazgoAbierto) {
  const desde = new Date(h.fecha_estado_cambio || h.creado_en);
  if (Number.isNaN(desde.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - desde.getTime()) / 86400000));
}

// Alerta visual: ALTA con más de 3 días abierta, MEDIA con más de 7.
function alertaPorDias(h: HallazgoAbierto, dias: number): 'roja' | 'amarilla' | null {
  if (h.criticidad === 'alta' && dias > 3) return 'roja';
  if (h.criticidad === 'media' && dias > 7) return 'amarilla';
  return null;
}

const CLASES_ALERTA = {
  roja: 'bg-red-50 dark:bg-red-950/40',
  amarilla: 'bg-amber-50 dark:bg-amber-950/40',
};

export default function SeguimientoPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [hallazgos, setHallazgos] = useState<HallazgoAbierto[] | null>(null);
  const [error, setError] = useState('');
  const [fEquipo, setFEquipo] = useState(searchParams.get('equipo') || 'todos');
  const [fCriticidad, setFCriticidad] = useState('todas');
  const [fEstados, setFEstados] = useState<string[]>([...ESTADOS_FILTRO]);

  const puedeVer = user?.rol === 'gerencial' || user?.rol === 'admin';

  useEffect(() => {
    if (!puedeVer) return;
    apiFetch<HallazgoAbierto[]>('/hallazgos/abiertos')
      .then(setHallazgos)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
  }, [puedeVer]);

  const equipos = useMemo(() => [...new Set((hallazgos || []).map((h) => h.equipo))].sort(), [hallazgos]);

  const filtrados = (hallazgos || []).filter(
    (h) =>
      (fEquipo === 'todos' || h.equipo === fEquipo) &&
      (fCriticidad === 'todas' || h.criticidad === fCriticidad) &&
      fEstados.includes(h.estado)
  );

  // Carga total de los hallazgos visibles (ya vienen sin "verificado" del
  // backend). Los NULL/0 se ignoran en la suma; parseCantidad tolera datos
  // históricos en texto ("12 hrs").
  const horasTotales = filtrados.reduce((acc, h) => acc + (parseCantidad(h.tiempo_reparacion) || 0), 0);
  const personasTotales = filtrados.reduce((acc, h) => acc + (parseCantidad(h.recursos) || 0), 0);

  // Tras un cambio de estado: actualizar la fila; si quedó verificado, sale de la lista.
  function actualizarFila(id: number, nuevo: { estado: string; fecha_estado_cambio: string | null }) {
    setHallazgos((prev) =>
      prev
        ? prev
            .map((h) => (h.id === id ? { ...h, estado: nuevo.estado, fecha_estado_cambio: nuevo.fecha_estado_cambio } : h))
            .filter((h) => h.estado !== 'verificado')
        : prev
    );
  }

  if (!puedeVer) {
    return (
      <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
        Esta vista es solo para roles gerenciales. Pide a un administrador que actualice tu rol.
      </p>
    );
  }

  return (
    <div>
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Seguimiento de hallazgos abiertos</h1>

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-44">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Equipo</p>
          <Select value={fEquipo} onValueChange={setFEquipo}>
            <SelectTrigger className="h-12 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los equipos</SelectItem>
              {equipos.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Criticidad</p>
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            {['todas', 'alta', 'media', 'baja'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFCriticidad(c)}
                className={`h-10 cursor-pointer rounded-full px-4 text-sm capitalize transition-colors ${
                  fCriticidad === c ? 'bg-card font-semibold text-brand shadow-sm dark:bg-slate-200 dark:text-brand-cyan' : 'font-medium text-slate-600'
                }`}
              >
                {c === 'todas' ? 'Todas' : ETIQUETAS_CRITICIDAD[c]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Estado</p>
          <div className="flex flex-wrap gap-2">
            {ESTADOS_FILTRO.map((e) => {
              const activo = fEstados.includes(e);
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => setFEstados((prev) => (activo ? prev.filter((x) => x !== e) : [...prev, e]))}
                  className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition-colors ${
                    activo ? 'border-brand bg-accent text-accent-foreground' : 'border-slate-200 bg-card text-slate-500'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${infoEstado(e).punto}`} aria-hidden="true" />
                  {infoEstado(e).etiqueta}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
      {!hallazgos && !error && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
        </div>
      )}
      {hallazgos && filtrados.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-card px-4 py-10 text-center text-slate-500">
          No hay hallazgos abiertos con estos filtros.
        </p>
      )}

      {/* Tabla (escritorio) */}
      {filtrados.length > 0 && (
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Equipo</th>
                <th className="px-3 py-3">Inspección (OT)</th>
                <th className="px-3 py-3">Hallazgo</th>
                <th className="px-3 py-3">Criticidad</th>
                <th className="px-3 py-3">Estado</th>
                <th className="px-3 py-3">Inspector</th>
                <th className="px-3 py-3 text-right">Días abierto</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((h) => {
                const dias = diasAbierto(h);
                const alerta = alertaPorDias(h, dias);
                return (
                  <tr key={h.id} className={`border-b border-slate-200 last:border-b-0 ${alerta ? CLASES_ALERTA[alerta] : ''}`}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{h.equipo}</td>
                    <td className="px-3 py-3 text-slate-600">{h.ot || '—'}</td>
                    <td className="px-3 py-3">
                      <Link to={`/inspecciones/${h.inspeccion_id}/hallazgos/${h.id}`} className="font-medium text-brand underline-offset-2 hover:underline dark:text-brand-cyan">
                        N°{h.numero}{h.tipo_dano ? ` · ${h.tipo_dano}` : ''}
                      </Link>
                      <p className="text-xs text-slate-500">{[h.sistema, h.sector].filter(Boolean).join(' — ') || '—'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${ESTILOS_CRITICIDAD[h.criticidad] || 'bg-slate-100 text-slate-700'}`}>
                        {ETIQUETAS_CRITICIDAD[h.criticidad] || h.criticidad}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${infoEstado(h.estado).pill}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${infoEstado(h.estado).punto}`} aria-hidden="true" />
                        {infoEstado(h.estado).etiqueta}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{h.inspector}</td>
                    <td className={`px-3 py-3 text-right font-bold ${alerta === 'roja' ? 'text-red-600' : alerta === 'amarilla' ? 'text-amber-600' : 'text-slate-900'}`}>
                      {dias}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <EstadoHallazgo hallazgoId={h.id} estado={h.estado} comoBoton onCambio={(n) => actualizarFila(h.id, n)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Resumen de carga total (pie de la tabla en escritorio) */}
      {filtrados.length > 0 && (
        <div className="mt-3 hidden flex-wrap gap-x-8 gap-y-1 rounded-xl border border-slate-200 bg-card px-4 py-3 text-sm shadow-sm md:flex">
          <span>
            <b className="text-slate-900">Horas totales estimadas:</b>{' '}
            {horasTotales > 0 ? `${horasTotales} horas` : 'Sin estimación'}
          </span>
          <span>
            <b className="text-slate-900">Personas requeridas:</b>{' '}
            {personasTotales > 0 ? `${personasTotales} personas` : 'Sin estimación'}
          </span>
        </div>
      )}

      {/* Cards (celular) */}
      {filtrados.length > 0 && (
        <div className="flex flex-col gap-2.5 md:hidden">
          {filtrados.map((h) => {
            const dias = diasAbierto(h);
            const alerta = alertaPorDias(h, dias);
            return (
              <div key={h.id} className={`rounded-xl border border-slate-200 p-4 shadow-sm ${alerta ? CLASES_ALERTA[alerta] : 'bg-card'}`}>
                <div className="mb-1 flex items-start justify-between gap-2">
                  <Link to={`/inspecciones/${h.inspeccion_id}/hallazgos/${h.id}`} className="font-bold text-slate-900">
                    {h.equipo} · N°{h.numero}
                  </Link>
                  <span className={`whitespace-nowrap text-sm font-bold ${alerta === 'roja' ? 'text-red-600' : alerta === 'amarilla' ? 'text-amber-600' : 'text-slate-500'}`}>
                    {dias} día{dias === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="mb-2 text-sm text-slate-600">
                  {h.ot ? `OT ${h.ot} · ` : ''}{h.tipo_dano || 'Sin tipo'} · {[h.sistema, h.sector].filter(Boolean).join(' — ') || 'Sin ubicación'}
                  <span className="block text-xs text-slate-500">Inspector: {h.inspector}</span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ESTILOS_CRITICIDAD[h.criticidad] || 'bg-slate-100 text-slate-700'}`}>
                    {ETIQUETAS_CRITICIDAD[h.criticidad] || h.criticidad}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${infoEstado(h.estado).pill}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${infoEstado(h.estado).punto}`} aria-hidden="true" />
                    {infoEstado(h.estado).etiqueta}
                  </span>
                  <span className="ml-auto">
                    <EstadoHallazgo hallazgoId={h.id} estado={h.estado} comoBoton onCambio={(n) => actualizarFila(h.id, n)} />
                  </span>
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-200 bg-card px-4 py-3 text-sm shadow-sm">
            <p>
              <b className="text-slate-900">Horas totales estimadas:</b>{' '}
              {horasTotales > 0 ? `${horasTotales} horas` : 'Sin estimación'}
            </p>
            <p className="mt-0.5">
              <b className="text-slate-900">Personas requeridas:</b>{' '}
              {personasTotales > 0 ? `${personasTotales} personas` : 'Sin estimación'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
