import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api';

interface HallazgosResumen {
  alta: number;
  media: number;
  baja: number;
  total: number;
}

interface InspeccionResumen {
  id: number;
  ot: string | null;
  fecha: string;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  horometro: string | number | null;
  estado: 'en_curso' | 'completada' | string;
  firmada: number;
  plantilla_id: number;
  plantilla_modelo: string;
  plantilla_tipo: string | null;
  hallazgos: HallazgosResumen;
}

interface EquipoDetalle {
  equipo_norm: string;
  equipo_display: string;
  modelo: string;
  tipo: string | null;
  total_inspecciones: number;
  ultima_fecha: string;
  ultima_inspeccion_id: number;
  hallazgos_criticos_abiertos: number;
  inspecciones: InspeccionResumen[];
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  en_curso: 'En curso',
  completada: 'Completada',
};

const ESTILOS_ESTADO: Record<string, string> = {
  en_curso: 'bg-amber-100 text-amber-800',
  completada: 'bg-green-100 text-green-800',
};

function formatoFecha(f: string | null) {
  if (!f) return '—';
  return f.slice(0, 10).split('-').reverse().join('-');
}

function BadgesHallazgos({ h }: { h: HallazgosResumen }) {
  if (h.total === 0) return <span className="text-sm text-slate-400">Sin hallazgos</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {h.alta > 0 && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
          {h.alta} alta{h.alta > 1 ? 's' : ''}
        </span>
      )}
      {h.media > 0 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
          {h.media} media{h.media > 1 ? 's' : ''}
        </span>
      )}
      {h.baja > 0 && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
          {h.baja} baja{h.baja > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

export default function TeamDetailPage() {
  const { equipoNorm } = useParams<{ equipoNorm: string }>();
  const [equipo, setEquipo] = useState<EquipoDetalle | null>(null);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState('');

  useEffect(() => {
    apiFetch<EquipoDetalle>(`/equipos/${equipoNorm}`)
      .then(setEquipo)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
  }, [equipoNorm]);

  async function descargarPdf(insp: InspeccionResumen) {
    if (!equipo) return;
    setDescargando(true);
    setErrorDescarga('');
    try {
      const r = await fetch(`/api/inspecciones/${insp.id}/informe`, { credentials: 'include' });
      if (!r.ok) {
        let texto = 'No se pudo generar el informe';
        try {
          const d = await r.json();
          texto = d.error || texto;
        } catch {
          // sin cuerpo JSON
        }
        throw new Error(texto);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Informe_${equipo.equipo_display}_${insp.fecha}`.replace(/[^\w.-]+/g, '_') + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorDescarga(e instanceof Error ? e.message : 'Ocurrió un error');
    } finally {
      setDescargando(false);
    }
  }

  if (error) {
    return (
      <div>
        <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>
        <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
          <div className="font-semibold">No se pudo cargar el equipo</div>
          {error}
        </div>
      </div>
    );
  }

  if (!equipo) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  const [ultimo, ...historial] = equipo.inspecciones;
  const ultimoCompletado = ultimo.estado === 'completada';

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold text-slate-900">{equipo.equipo_display}</h1>
          <p className="text-sm text-slate-500">
            {equipo.modelo}
            {equipo.tipo ? ` · ${equipo.tipo}` : ''} · {equipo.total_inspecciones} inspección
            {equipo.total_inspecciones === 1 ? '' : 'es'}
          </p>
        </div>
        <Link
          to={`/inspecciones/nueva?equipo=${equipo.equipo_norm}`}
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-brand px-5 font-heading text-sm font-medium text-white transition-colors hover:bg-brand-teal"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva inspección
        </Link>
      </div>

      {/* Destacado: último informe */}
      <div className="mb-5 rounded-xl border-2 border-brand bg-card p-4 shadow-md dark:border-brand-cyan">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-heading text-base font-semibold text-slate-900">Último informe</h2>
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${ESTILOS_ESTADO[ultimo.estado] || 'bg-slate-100 text-slate-700'}`}>
            {ETIQUETAS_ESTADO[ultimo.estado] || ultimo.estado}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
          <span><b className="text-slate-900">Fecha:</b> {formatoFecha(ultimo.fecha)}</span>
          <span><b className="text-slate-900">OT:</b> {ultimo.ot || '—'}</span>
          <span><b className="text-slate-900">Horómetro:</b> {ultimo.horometro ?? '—'}</span>
          {ultimo.firmada === 1 && (
            <span className="inline-flex items-center gap-1 font-bold text-brand dark:text-brand-cyan">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Firmada
            </span>
          )}
        </div>

        <div className="mt-2.5">
          <BadgesHallazgos h={ultimo.hallazgos} />
        </div>

        {errorDescarga && (
          <div className="mt-2.5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errorDescarga}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button asChild variant="gradient" size="sm">
            <Link to={`/inspecciones/${ultimo.id}`}>Ver informe</Link>
          </Button>
          {ultimoCompletado && ultimo.hallazgos.total > 0 && (
            <Button variant="outline" size="sm" onClick={() => descargarPdf(ultimo)} disabled={descargando}>
              {descargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              Descargar PDF
            </Button>
          )}
          {ultimoCompletado && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/inspecciones/${ultimo.id}?revision=1`}>Nueva revisión guiada</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <>
          <h2 className="mb-2 font-heading text-base font-semibold text-slate-900">Historial</h2>
          <div className="flex flex-col gap-2">
            {historial.map((insp) => (
              <Link
                key={insp.id}
                to={`/inspecciones/${insp.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-card p-3.5 shadow-sm transition-colors hover:border-brand"
              >
                <div>
                  <div className="font-semibold text-slate-900">
                    OT {insp.ot || '-'} · {formatoFecha(insp.fecha)}
                  </div>
                  <div className="mt-1">
                    <BadgesHallazgos h={insp.hallazgos} />
                  </div>
                </div>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${ESTILOS_ESTADO[insp.estado] || 'bg-slate-100 text-slate-700'}`}>
                  {ETIQUETAS_ESTADO[insp.estado] || insp.estado}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
