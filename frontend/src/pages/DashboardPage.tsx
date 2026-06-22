import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertTriangle, Clock, Gauge } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, ApiError } from '@/lib/api';

interface Resumen {
  total_equipos: number;
  inspecciones_mes: number;
  hallazgos_criticos_abiertos: number;
  hallazgos_totales_abiertos: number;
  horas_pendientes: number;
  personas_requeridas: number;
}

interface EquipoSalud {
  equipo: string;
  modelo: string | null;
  ultima_inspeccion: string | null;
  horometro_ultimo: number | string | null;
  criticos: number;
  medios: number;
  bajos: number;
  estado_salud: 'critico' | 'alerta' | 'normal';
}

interface SemanaTendencia {
  semana: string;
  inspecciones: number;
  hallazgos_nuevos: number;
}

interface InspectorRanking {
  inspector: string;
  inspecciones_mes: number;
  hallazgos_registrados: number;
  promedio_hallazgos_por_inspeccion: number;
}

const PERIODOS = [
  { valor: '30', etiqueta: '30 días' },
  { valor: '90', etiqueta: '90 días' },
  { valor: 'anio', etiqueta: 'Este año' },
  { valor: 'todo', etiqueta: 'Todo' },
];

const SALUD: Record<EquipoSalud['estado_salud'], { etiqueta: string; punto: string; texto: string }> = {
  critico: { etiqueta: 'Crítico', punto: 'bg-red-500', texto: 'text-red-700' },
  alerta: { etiqueta: 'Alerta', punto: 'bg-amber-500', texto: 'text-amber-700' },
  normal: { etiqueta: 'Normal', punto: 'bg-green-500', texto: 'text-green-700' },
};

function fechaCorta(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function construirQuery(periodo: string, equipos: string[], modelos: string[]) {
  const params = new URLSearchParams();
  params.set('periodo', periodo);
  if (equipos.length) params.set('equipo', equipos.join(','));
  if (modelos.length) params.set('modelo', modelos.join(','));
  return params.toString();
}

export default function DashboardPage() {
  const [periodo, setPeriodo] = useState('30');
  const [equiposSel, setEquiposSel] = useState<string[]>([]);
  const [modelosSel, setModelosSel] = useState<string[]>([]);
  const [filtroSalud, setFiltroSalud] = useState<'todos' | EquipoSalud['estado_salud']>('todos');

  const [catalogo, setCatalogo] = useState<EquipoSalud[] | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [equipos, setEquipos] = useState<EquipoSalud[] | null>(null);
  const [tendencia, setTendencia] = useState<SemanaTendencia[] | null>(null);
  const [inspectores, setInspectores] = useState<InspectorRanking[] | null>(null);
  const [error, setError] = useState('');

  const flotaRef = useRef<HTMLDivElement>(null);

  // Catálogo de equipos/modelos para los filtros (independiente de la selección).
  useEffect(() => {
    apiFetch<EquipoSalud[]>('/dashboard/equipos?periodo=todo')
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  useEffect(() => {
    const q = construirQuery(periodo, equiposSel, modelosSel);
    setError('');
    Promise.all([
      apiFetch<Resumen>(`/dashboard/resumen?${q}`),
      apiFetch<EquipoSalud[]>(`/dashboard/equipos?${q}`),
      apiFetch<SemanaTendencia[]>(`/dashboard/tendencia?${q}`),
      apiFetch<InspectorRanking[]>(`/dashboard/inspectores?${q}`),
    ])
      .then(([r, e, t, i]) => {
        setResumen(r);
        setEquipos(e);
        setTendencia(t);
        setInspectores(i);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor'));
  }, [periodo, equiposSel, modelosSel]);

  const equiposCatalogo = useMemo(
    () => [...new Set((catalogo || []).map((e) => e.equipo))].sort(),
    [catalogo]
  );
  const modelosCatalogo = useMemo(
    () => [...new Set((catalogo || []).map((e) => e.modelo).filter((m): m is string => !!m))].sort(),
    [catalogo]
  );

  function toggleEnLista(valor: string, lista: string[], set: (v: string[]) => void) {
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  function irACriticos() {
    setFiltroSalud('critico');
    flotaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const equiposFiltrados = (equipos || []).filter((e) => filtroSalud === 'todos' || e.estado_salud === filtroSalud);

  const sinDatos = resumen !== null && resumen.total_equipos === 0;

  return (
    <div>
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Dashboard gerencial</h1>

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Período</p>
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPeriodo(p.valor)}
                className={`h-10 flex-1 cursor-pointer rounded-full px-3 text-sm font-medium transition-colors sm:flex-none sm:px-4 ${
                  periodo === p.valor ? 'bg-card font-semibold text-brand shadow-sm dark:bg-slate-200 dark:text-brand-cyan' : 'text-slate-600'
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {equiposCatalogo.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Equipos</p>
            <div className="flex flex-wrap gap-2">
              {equiposCatalogo.map((e) => {
                const activo = equiposSel.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => toggleEnLista(e, equiposSel, setEquiposSel)}
                    className={`inline-flex h-10 cursor-pointer items-center rounded-full border-2 px-3 text-sm font-semibold transition-colors ${
                      activo ? 'border-brand bg-accent text-accent-foreground' : 'border-slate-200 bg-card text-slate-500'
                    }`}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {modelosCatalogo.length > 1 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Modelo</p>
            <div className="flex flex-wrap gap-2">
              {modelosCatalogo.map((m) => {
                const activo = modelosSel.includes(m);
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => toggleEnLista(m, modelosSel, setModelosSel)}
                    className={`inline-flex h-10 cursor-pointer items-center rounded-full border-2 px-3 text-sm font-semibold transition-colors ${
                      activo ? 'border-brand bg-accent text-accent-foreground' : 'border-slate-200 bg-card text-slate-500'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}

      {!resumen && !error && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
        </div>
      )}

      {sinDatos && (
        <p className="rounded-xl border border-slate-200 bg-card px-4 py-10 text-center text-slate-500">
          Aún no hay inspecciones registradas para estos filtros.
        </p>
      )}

      {resumen && !sinDatos && (
        <>
          {/* KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={irACriticos}
              className="flex flex-col items-start gap-1 rounded-xl border border-red-200 bg-red-50 p-4 text-left shadow-sm transition-colors hover:border-red-400"
            >
              <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
              <span className="text-2xl font-bold text-red-700">{resumen.hallazgos_criticos_abiertos}</span>
              <span className="text-xs font-medium text-red-700">Hallazgos críticos</span>
            </button>

            <div className="flex flex-col items-start gap-1 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <Gauge className="h-5 w-5 text-amber-600" aria-hidden="true" />
              <span className="text-2xl font-bold text-amber-700">{resumen.hallazgos_totales_abiertos}</span>
              <span className="text-xs font-medium text-amber-700">Hallazgos totales</span>
            </div>

            <div className="flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
              <Clock className="h-5 w-5 text-slate-500" aria-hidden="true" />
              <span className="text-2xl font-bold text-slate-900">{resumen.horas_pendientes}</span>
              <span className="text-xs font-medium text-slate-500">Horas estimadas</span>
              {resumen.personas_requeridas > 0 && (
                <span className="text-xs text-slate-400">{resumen.personas_requeridas} personas requeridas</span>
              )}
            </div>
          </div>

          {/* Salud de flota */}
          <div ref={flotaRef} className="mb-4 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-base font-semibold text-slate-900">Salud de la flota</h2>
              <div className="flex gap-1 rounded-full bg-slate-100 p-1">
                {(['todos', 'critico', 'alerta', 'normal'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFiltroSalud(s)}
                    className={`h-9 cursor-pointer rounded-full px-3 text-xs font-semibold capitalize transition-colors ${
                      filtroSalud === s ? 'bg-card font-semibold text-brand shadow-sm dark:bg-slate-200 dark:text-brand-cyan' : 'text-slate-600'
                    }`}
                  >
                    {s === 'todos' ? 'Todos' : SALUD[s].etiqueta}
                  </button>
                ))}
              </div>
            </div>

            {equiposFiltrados.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No hay equipos con estos filtros.</p>
            )}

            {/* Tabla escritorio */}
            {equiposFiltrados.length > 0 && (
              <div className="hidden overflow-hidden rounded-lg border border-slate-200 md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Equipo</th>
                      <th className="px-3 py-2">Modelo</th>
                      <th className="px-3 py-2">Última inspección</th>
                      <th className="px-3 py-2 text-right">Horómetro</th>
                      <th className="px-3 py-2 text-right">Críticos</th>
                      <th className="px-3 py-2 text-right">Medios</th>
                      <th className="px-3 py-2 text-right">Bajos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equiposFiltrados.map((e) => (
                      <tr key={e.equipo} className="border-b border-slate-200 last:border-b-0">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${SALUD[e.estado_salud].texto}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${SALUD[e.estado_salud].punto}`} aria-hidden="true" />
                            {SALUD[e.estado_salud].etiqueta}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{e.equipo}</td>
                        <td className="px-3 py-2 text-slate-600">{e.modelo || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{fechaCorta(e.ultima_inspeccion)}</td>
                        <td className="px-3 py-2 text-right text-slate-600">{e.horometro_ultimo ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{e.criticos}</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-600">{e.medios}</td>
                        <td className="px-3 py-2 text-right font-bold text-green-600">{e.bajos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cards móvil */}
            {equiposFiltrados.length > 0 && (
              <div className="flex flex-col gap-2.5 md:hidden">
                {equiposFiltrados.map((e) => (
                  <div key={e.equipo} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{e.equipo}</span>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${SALUD[e.estado_salud].texto}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${SALUD[e.estado_salud].punto}`} aria-hidden="true" />
                        {SALUD[e.estado_salud].etiqueta}
                      </span>
                    </div>
                    <p className="mb-2 text-sm text-slate-500">
                      {e.modelo || 'Sin modelo'} · Última: {fechaCorta(e.ultima_inspeccion)} · Horómetro {e.horometro_ultimo ?? '—'}
                    </p>
                    <div className="flex gap-2 text-xs font-bold">
                      <span className="text-red-600">{e.criticos} críticos</span>
                      <span className="text-amber-600">{e.medios} medios</span>
                      <span className="text-green-600">{e.bajos} bajos</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tendencia 8 semanas */}
          <div className="mb-4 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
            <h2 className="mb-2 font-heading text-base font-semibold text-slate-900">Tendencia (últimas 8 semanas)</h2>
            {tendencia ? (
              <div className="-ml-2 h-64 w-full overflow-x-auto">
                <ResponsiveContainer width="100%" height="100%" minWidth={480}>
                  <LineChart data={tendencia} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="semana" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="inspecciones" name="Inspecciones" stroke="#006397" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="hallazgos_nuevos" name="Hallazgos nuevos" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
              </div>
            )}
          </div>

          {/* Ranking inspectores */}
          <div className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
            <h2 className="mb-2 font-heading text-base font-semibold text-slate-900">Ranking de inspectores</h2>
            {!inspectores && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
              </div>
            )}
            {inspectores && inspectores.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Sin inspecciones registradas en este período.</p>
            )}
            {inspectores && inspectores.length > 0 && (
              <>
                {/* Tabla escritorio */}
                <div className="hidden overflow-hidden rounded-lg border border-slate-200 md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2">Inspector</th>
                        <th className="px-3 py-2 text-right">Inspecciones</th>
                        <th className="px-3 py-2 text-right">Hallazgos registrados</th>
                        <th className="px-3 py-2 text-right">Promedio por inspección</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectores.map((i) => (
                        <tr key={i.inspector} className="border-b border-slate-200 last:border-b-0">
                          <td className="px-3 py-2 font-semibold text-slate-900">{i.inspector}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{i.inspecciones_mes}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{i.hallazgos_registrados}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{i.promedio_hallazgos_por_inspeccion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards móvil */}
                <div className="flex flex-col gap-2.5 md:hidden">
                  {inspectores.map((i) => (
                    <div key={i.inspector} className="rounded-lg border border-slate-200 p-3">
                      <div className="font-bold text-slate-900">{i.inspector}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {i.inspecciones_mes} inspecciones · {i.hallazgos_registrados} hallazgos · {i.promedio_hallazgos_por_inspeccion} prom.
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
