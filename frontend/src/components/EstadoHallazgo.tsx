import { useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Loader2, ShieldCheck, Wrench, X } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';

export type EstadoCiclo = 'detectado' | 'en_reparacion' | 'resuelto' | 'verificado';

export const ESTADOS_CICLO: {
  valor: EstadoCiclo;
  etiqueta: string;
  icono: typeof AlertCircle;
  punto: string; // color sólido (#EF4444 etc. vía clases Tailwind)
  pill: string;
  boton: string;
}[] = [
  { valor: 'detectado', etiqueta: 'Detectado', icono: AlertCircle, punto: 'bg-red-500', pill: 'bg-red-100 text-red-700', boton: 'border-red-500 text-red-700' },
  { valor: 'en_reparacion', etiqueta: 'En reparación', icono: Wrench, punto: 'bg-amber-500', pill: 'bg-amber-100 text-amber-800', boton: 'border-amber-500 text-amber-800' },
  { valor: 'resuelto', etiqueta: 'Resuelto', icono: CheckCircle2, punto: 'bg-blue-500', pill: 'bg-blue-100 text-blue-700', boton: 'border-blue-500 text-blue-700' },
  { valor: 'verificado', etiqueta: 'Verificado ✓', icono: ShieldCheck, punto: 'bg-green-500', pill: 'bg-green-100 text-green-700', boton: 'border-green-500 text-green-700' },
];

export function infoEstado(estado: string | null | undefined) {
  return ESTADOS_CICLO.find((e) => e.valor === estado) || ESTADOS_CICLO[0];
}

// Transición permitida: el siguiente paso del ciclo, o reabrir a 'detectado'.
function transicionValida(desde: EstadoCiclo, hacia: EstadoCiclo) {
  const orden = ESTADOS_CICLO.map((e) => e.valor);
  if (hacia === 'detectado') return desde !== 'detectado';
  return orden.indexOf(hacia) === orden.indexOf(desde) + 1;
}

interface EventoHistorial {
  id: number;
  estado_anterior: string | null;
  estado_nuevo: string;
  usuario: string;
  comentario: string | null;
  fecha: string;
}

function formatoFechaHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}`;
}

interface Props {
  hallazgoId: number;
  estado: string | null | undefined;
  onCambio?: (hallazgoActualizado: { estado: string; fecha_estado_cambio: string | null }) => void;
  /** Muestra el timeline de cambios debajo del badge */
  conHistorial?: boolean;
  /** Texto alternativo del disparador (ej. "Cambiar estado" en la tabla de seguimiento) */
  comoBoton?: boolean;
  disabled?: boolean;
}

export default function EstadoHallazgo({ hallazgoId, estado, onCambio, conHistorial, comoBoton, disabled }: Props) {
  const actual = infoEstado(estado);
  const [abierto, setAbierto] = useState(false);
  const [seleccion, setSeleccion] = useState<EstadoCiclo | null>(null);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [historial, setHistorial] = useState<EventoHistorial[] | null>(null);
  const [historialCompleto, setHistorialCompleto] = useState(false);

  useEffect(() => {
    if (!conHistorial) return;
    apiFetch<EventoHistorial[]>(`/hallazgos/${hallazgoId}/historial`)
      .then(setHistorial)
      .catch(() => setHistorial([]));
  }, [hallazgoId, conHistorial, estado]);

  function abrir() {
    if (disabled) return;
    setSeleccion(null);
    setComentario('');
    setError('');
    setAbierto(true);
  }

  async function confirmar() {
    if (!seleccion) return;
    if (seleccion === 'detectado' && actual.valor !== 'detectado') {
      if (!confirm('¿Reabrir hallazgo? Volverá al estado "Detectado".')) return;
    }
    setGuardando(true);
    setError('');
    try {
      const h = await apiFetch<{ estado: string; fecha_estado_cambio: string | null }>(
        `/hallazgos/${hallazgoId}/estado`,
        { method: 'PATCH', body: JSON.stringify({ estado: seleccion, comentario: comentario.trim() || null }) }
      );
      setAbierto(false);
      onCambio?.(h);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
    } finally {
      setGuardando(false);
    }
  }

  const eventos = historial || [];
  const visibles = historialCompleto ? eventos : eventos.slice(0, 5);

  return (
    <div className={conHistorial ? 'min-w-0' : 'inline-block'}>
      {/* Disparador: badge del estado actual (o botón pequeño) */}
      {comoBoton ? (
        <button
          type="button"
          onClick={abrir}
          disabled={disabled}
          className="h-10 cursor-pointer whitespace-nowrap rounded-full border border-input bg-card px-4 text-sm font-medium text-slate-900 transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
        >
          Cambiar estado
        </button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={disabled}
          title={disabled ? undefined : 'Toca para cambiar el estado'}
          className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-bold transition-transform active:scale-[.97] disabled:pointer-events-none ${actual.pill}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${actual.punto}`} aria-hidden="true" />
          {actual.etiqueta}
        </button>
      )}

      {/* Timeline compacto */}
      {conHistorial && eventos.length > 0 && (
        <div className="mt-3">
          <ol className="relative ml-3 border-l-2 border-slate-200">
            {visibles.map((ev) => {
              const info = infoEstado(ev.estado_nuevo);
              const Icono = info.icono;
              const anterior = ev.estado_anterior ? infoEstado(ev.estado_anterior).etiqueta.replace(' ✓', '') : '—';
              return (
                <li key={ev.id} className="relative mb-3 pl-6 last:mb-0">
                  <span className={`absolute -left-[13px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white ${info.punto}`}>
                    <Icono className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {anterior} → {info.etiqueta.replace(' ✓', '')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ev.usuario} · {formatoFechaHora(ev.fecha)}
                  </p>
                  {ev.comentario && <p className="mt-0.5 text-xs text-slate-400">{ev.comentario}</p>}
                </li>
              );
            })}
          </ol>
          {eventos.length > 5 && !historialCompleto && (
            <button
              type="button"
              onClick={() => setHistorialCompleto(true)}
              className="mt-1 cursor-pointer text-sm font-medium text-brand dark:text-brand-cyan"
            >
              Ver historial completo ({eventos.length})
            </button>
          )}
        </div>
      )}

      {/* Bottom sheet */}
      {abierto && (
        <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true" aria-label="Cambiar estado del hallazgo">
          <div className="absolute inset-0 bg-black/50" onClick={() => !guardando && setAbierto(false)} />
          <div className="animate-in slide-in-from-bottom absolute inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-3xl bg-card p-5 pb-7 shadow-2xl duration-300">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-slate-900">Cambiar estado del hallazgo</h3>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-secondary"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {ESTADOS_CICLO.map((e) => {
                const esActual = e.valor === actual.valor;
                const permitido = !esActual && transicionValida(actual.valor, e.valor);
                const Icono = e.icono;
                return (
                  <button
                    key={e.valor}
                    type="button"
                    disabled={esActual || !permitido}
                    aria-pressed={seleccion === e.valor}
                    onClick={() => setSeleccion(e.valor)}
                    className={`flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 text-left font-heading text-base font-semibold transition-colors disabled:cursor-not-allowed ${
                      esActual
                        ? `${e.boton} bg-secondary opacity-70`
                        : seleccion === e.valor
                          ? `${e.boton} bg-accent`
                          : permitido
                            ? 'border-slate-200 bg-card text-slate-900 active:border-brand'
                            : 'border-slate-200 bg-card text-slate-400 opacity-50'
                    }`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${e.punto}`}>
                      <Icono className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="flex-1">{e.etiqueta}</span>
                    {esActual && <Check className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <label htmlFor={`comentario-${hallazgoId}`} className="mb-1 mt-4 block text-sm font-medium text-slate-600">
              Comentario (opcional)
            </label>
            <textarea
              id={`comentario-${hallazgoId}`}
              rows={2}
              value={comentario}
              onChange={(ev) => setComentario(ev.target.value)}
              placeholder="ej. Reparado por soldadura, OT 4521"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            {error && (
              <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={!seleccion || guardando}
              onClick={confirmar}
              className="mt-4 flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal disabled:pointer-events-none disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              Confirmar cambio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
