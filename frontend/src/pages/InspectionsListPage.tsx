import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Inspeccion {
  id: number;
  equipo: string;
  plantilla_modelo: string | null;
  ot: string | null;
  fecha: string;
  horometro: number | string | null;
  estado: 'en_curso' | 'completada' | string;
  firmada: number;
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  en_curso: 'En curso',
  completada: 'Completada',
};

const ESTILOS_ESTADO: Record<string, string> = {
  en_curso: 'bg-amber-100 text-amber-800',
  completada: 'bg-green-100 text-green-800',
};

function formatoFecha(f: string) {
  if (!f) return '';
  return f.slice(0, 10).split('-').reverse().join('-');
}

export default function InspectionsListPage() {
  const [inspecciones, setInspecciones] = useState<Inspeccion[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Inspeccion[]>('/inspecciones')
      .then(setInspecciones)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error de conexión con el servidor'));
  }, []);

  return (
    <div>
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Mis inspecciones</h1>

      <Link
        to="/inspecciones/nueva"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        Nueva inspección
      </Link>

      <div className="mt-4 flex flex-col gap-2.5">
        {!inspecciones && !error && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
            <div className="font-semibold">No se pudieron cargar las inspecciones</div>
            {error}
          </div>
        )}

        {inspecciones && inspecciones.length === 0 && (
          <div className="rounded-lg px-4 py-10 text-center text-slate-400">
            <div className="mb-1 font-semibold text-slate-600">Todavía no tienes inspecciones</div>
            Toca &quot;Nueva inspección&quot; para comenzar a registrar hallazgos en terreno.
          </div>
        )}

        {inspecciones?.map((i) => {
          const completadaSinFirma = i.estado === 'completada' && i.firmada !== 1;
          return (
            <Link
              key={i.id}
              to={`/inspecciones/${i.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm transition-colors hover:border-brand"
            >
              <div>
                <div className="font-bold text-slate-900">
                  {i.equipo} · {i.plantilla_modelo || 'Sin plantilla'}
                </div>
                <div className="mt-0.5 text-sm text-slate-500">
                  OT {i.ot || '-'} · {formatoFecha(i.fecha)} · Horómetro {i.horometro ?? '-'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${ESTILOS_ESTADO[i.estado] || 'bg-slate-100 text-slate-700'}`}>
                  {i.firmada === 1 && <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                  {ETIQUETAS_ESTADO[i.estado] || i.estado}
                </span>
                {completadaSinFirma && (
                  <span className="whitespace-nowrap text-[11px] text-slate-400">Sin firma digital</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
