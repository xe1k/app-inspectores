import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Plus, Search } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { tiempoRelativo } from '@/lib/fechas';

interface EquipoResumen {
  equipo_norm: string;
  equipo_display: string;
  modelo: string;
  tipo: string | null;
  total_inspecciones: number;
  ultima_fecha: string;
  ultima_inspeccion_id: number;
  hallazgos_criticos_abiertos: number;
}

export default function FleetPage() {
  const [equipos, setEquipos] = useState<EquipoResumen[] | null>(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    apiFetch<EquipoResumen[]>('/equipos')
      .then(setEquipos)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
  }, []);

  const filtrados = useMemo(() => {
    if (!equipos) return null;
    const q = busqueda.trim().toLowerCase();
    if (!q) return equipos;
    return equipos.filter((e) => e.equipo_display.toLowerCase().includes(q));
  }, [equipos, busqueda]);

  return (
    <div>
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Equipos</h1>

      <Link
        to="/inspecciones/nueva"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        Nueva inspección
      </Link>

      {equipos && equipos.length > 0 && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar equipo…"
            className="h-11 w-full rounded-full border border-slate-200 bg-card pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {!equipos && !error && (
          <div className="col-span-full flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
          </div>
        )}

        {error && (
          <div className="col-span-full rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
            <div className="font-semibold">No se pudieron cargar los equipos</div>
            {error}
          </div>
        )}

        {equipos && equipos.length === 0 && (
          <div className="col-span-full rounded-lg px-4 py-10 text-center text-slate-400">
            <div className="mb-1 font-semibold text-slate-600">Aún no hay equipos</div>
            Crea tu primera inspección para comenzar.
          </div>
        )}

        {equipos && equipos.length > 0 && filtrados?.length === 0 && (
          <div className="col-span-full rounded-lg px-4 py-10 text-center text-slate-400">
            No se encontraron equipos para &quot;{busqueda}&quot;.
          </div>
        )}

        {filtrados?.map((e) => (
          <Link
            key={e.equipo_norm}
            to={`/equipos/${e.equipo_norm}`}
            className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-card p-4 shadow-sm transition-colors hover:border-brand"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-heading text-base font-bold text-slate-900">{e.equipo_display}</span>
              {e.hallazgos_criticos_abiertos > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                  {e.hallazgos_criticos_abiertos}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Sin críticos
                </span>
              )}
            </div>
            <div className="text-sm text-slate-500">
              {e.modelo}{e.tipo ? ` · ${e.tipo}` : ''}
            </div>
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-slate-600">Última: {tiempoRelativo(e.ultima_fecha)}</span>
              <span className="text-slate-400">
                {e.total_inspecciones} inspección{e.total_inspecciones === 1 ? '' : 'es'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
