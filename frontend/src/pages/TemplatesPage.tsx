import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface Plantilla {
  id: number;
  modelo: string;
  tipo: string | null;
  creado_en: string;
}

function formatoFecha(f: string) {
  if (!f) return '';
  return f.slice(0, 10).split('-').reverse().join('-');
}

export default function TemplatesPage() {
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Plantilla[]>('/plantillas')
      .then(setPlantillas)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error de conexión con el servidor'));
  }, []);

  return (
    <div>
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Plantillas de equipo</h1>

      <Link
        to="/plantillas/nueva"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        Nueva plantilla
      </Link>

      <div className="mt-4 flex flex-col gap-2.5">
        {!plantillas && !error && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
            <div className="font-semibold">No se pudieron cargar las plantillas</div>
            {error}
          </div>
        )}

        {plantillas && plantillas.length === 0 && (
          <div className="rounded-lg px-4 py-10 text-center text-slate-400">
            <div className="mb-1 font-semibold text-slate-600">Todavía no hay plantillas</div>
            Toca &quot;Nueva plantilla&quot; para registrar un modelo de equipo.
          </div>
        )}

        {plantillas?.map((p) => (
          <Link
            key={p.id}
            to={`/plantillas/${p.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm transition-colors hover:border-brand"
          >
            <div>
              <div className="font-bold text-slate-900">{p.modelo}</div>
              <div className="mt-0.5 text-sm text-slate-500">{p.tipo || 'Sin tipo'}</div>
            </div>
            <span className="whitespace-nowrap text-xs text-slate-400">{formatoFecha(p.creado_en)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
