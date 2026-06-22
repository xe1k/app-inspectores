import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, UserPlus, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/Toast';
import { useAuth, type Rol } from '@/contexts/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import { fechaHoraCorta } from '@/lib/fechas';

const ROLES: { value: Rol; label: string }[] = [
  { value: 'inspector', label: 'Inspector' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'gerencial', label: 'Gerencial' },
  { value: 'admin', label: 'Administrador' },
];

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  nombre_completo: string;
  rol: Rol;
  activo: number;
  creado_en: string;
}

function mensajeError(e: unknown) {
  return e instanceof ApiError ? e.message : 'Error de conexión con el servidor';
}

// ── Sección Usuarios ─────────────────────────────────────────────────────────

function SeccionUsuarios() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);

  // Nuevo usuario
  const [username, setUsername] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<Rol>('inspector');
  const [password, setPassword] = useState('');
  const [creando, setCreando] = useState(false);

  // Ediciones en curso por fila (rol/activo)
  const [editado, setEditado] = useState<Record<number, { rol: Rol; activo: number }>>({});
  const [guardandoId, setGuardandoId] = useState<number | null>(null);

  async function cargar() {
    try {
      const data = await apiFetch<Usuario[]>('/admin/usuarios');
      setUsuarios(data);
      setError('');
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crearUsuario(e: FormEvent) {
    e.preventDefault();
    setCreando(true);
    try {
      await apiFetch<Usuario>('/admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), nombre: nombre.trim(), rol, password }),
      });
      showToast('Usuario creado', 'ok');
      setUsername('');
      setNombre('');
      setRol('inspector');
      setPassword('');
      setMostrarForm(false);
      cargar();
    } catch (e) {
      showToast(mensajeError(e), 'error');
    } finally {
      setCreando(false);
    }
  }

  function valorFila(u: Usuario) {
    return editado[u.id] ?? { rol: u.rol, activo: u.activo };
  }

  function cambioFila(u: Usuario, cambio: Partial<{ rol: Rol; activo: number }>) {
    setEditado((prev) => ({ ...prev, [u.id]: { ...valorFila(u), ...cambio } }));
  }

  function filaModificada(u: Usuario) {
    const v = editado[u.id];
    return v && (v.rol !== u.rol || v.activo !== u.activo);
  }

  async function guardarFila(u: Usuario) {
    const v = valorFila(u);
    setGuardandoId(u.id);
    try {
      await apiFetch<Usuario>(`/admin/usuarios/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre: u.nombre, rol: v.rol, activo: v.activo }),
      });
      showToast('Cambios guardados', 'ok');
      setEditado((prev) => {
        const copia = { ...prev };
        delete copia[u.id];
        return copia;
      });
      cargar();
    } catch (e) {
      showToast(mensajeError(e), 'error');
    } finally {
      setGuardandoId(null);
    }
  }

  async function resetearClave(u: Usuario) {
    const nueva = window.prompt(`Nueva clave para ${u.nombre} (mínimo 6 caracteres):`);
    if (nueva === null) return;
    if (nueva.length < 6) {
      showToast('La clave debe tener al menos 6 caracteres', 'error');
      return;
    }
    try {
      await apiFetch(`/admin/usuarios/${u.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: nueva }),
      });
      showToast('Clave actualizada', 'ok');
    } catch (e) {
      showToast(mensajeError(e), 'error');
    }
  }

  if (error) {
    return <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>;
  }
  if (!usuarios) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{usuarios.length} usuario(s) en el sistema.</p>
        <Button type="button" variant="gradient" className="h-11" onClick={() => setMostrarForm((v) => !v)}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> Agregar usuario
        </Button>
      </div>

      {mostrarForm && (
        <form onSubmit={crearUsuario} className="space-y-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900">Nuevo usuario</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-username">Usuario (correo)</Label>
              <Input id="nuevo-username" required className="h-12 bg-card text-base" value={username}
                onChange={(e) => setUsername(e.target.value)} placeholder="inspector@chaba.cl" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-nombre">Nombre</Label>
              <Input id="nuevo-nombre" required className="h-12 bg-card text-base" value={nombre}
                onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-rol">Rol</Label>
              <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
                <SelectTrigger id="nuevo-rol" className="h-11 bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuevo-password">Clave (mínimo 6)</Label>
              <Input id="nuevo-password" type="text" required minLength={6} className="h-12 bg-card text-base"
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="clave inicial" />
            </div>
          </div>
          <Button type="submit" variant="gradient" disabled={creando} className="h-11">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Crear usuario
          </Button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Usuario</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Activo</th>
              <th className="px-3 py-2 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const v = valorFila(u);
              const esYo = u.id === user?.id;
              return (
                <tr key={u.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {u.nombre}
                    {esYo && <span className="ml-1 text-xs text-slate-400">(tú)</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{u.username}</td>
                  <td className="px-3 py-2">
                    <Select value={v.rol} onValueChange={(val) => cambioFila(u, { rol: val as Rol })}>
                      <SelectTrigger className="h-9 w-[140px] bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input type="checkbox" className="h-4 w-4 accent-brand" checked={v.activo === 1}
                        onChange={(e) => cambioFila(u, { activo: e.target.checked ? 1 : 0 })} />
                      <span className={v.activo === 1 ? 'text-green-700' : 'text-slate-400'}>
                        {v.activo === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" className="h-9 px-2 text-slate-600"
                        onClick={() => resetearClave(u)} title="Resetear clave">
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="gradient" className="h-9"
                        disabled={!filaModificada(u) || guardandoId === u.id} onClick={() => guardarFila(u)}>
                        {guardandoId === u.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        Guardar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sección Historial ────────────────────────────────────────────────────────

interface InspeccionHist {
  id: number;
  equipo: string;
  ot: string | null;
  estado: string;
  firmada: number;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  fecha: string;
  modelo: string;
  inspector: string;
}
interface FirmaHist {
  id: number;
  accion: string;
  timestamp: string;
  motivo: string | null;
  equipo: string;
  ot: string | null;
  usuario: string;
}
interface HallazgoHist {
  id: number;
  numero: number;
  criticidad: string;
  sistema: string | null;
  sector: string | null;
  fecha: string;
  inspeccion_id: number;
  equipo: string;
  modelo: string;
  inspector: string;
}

const critColor: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-slate-100 text-slate-600',
};

function Cargando() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
    </div>
  );
}

function SeccionHistorial() {
  const { showToast } = useToast();
  const [sub, setSub] = useState<'inspecciones' | 'hallazgos'>('inspecciones');
  const [inspecciones, setInspecciones] = useState<InspeccionHist[] | null>(null);
  const [firmas, setFirmas] = useState<FirmaHist[] | null>(null);
  const [hallazgos, setHallazgos] = useState<HallazgoHist[] | null>(null);

  useEffect(() => {
    if (sub === 'inspecciones' && inspecciones === null) {
      Promise.all([
        apiFetch<InspeccionHist[]>('/admin/historial/inspecciones'),
        apiFetch<FirmaHist[]>('/admin/historial/firmas'),
      ])
        .then(([insp, firm]) => { setInspecciones(insp); setFirmas(firm); })
        .catch((e) => showToast(mensajeError(e), 'error'));
    }
    if (sub === 'hallazgos' && hallazgos === null) {
      apiFetch<HallazgoHist[]>('/admin/historial/hallazgos')
        .then(setHallazgos)
        .catch((e) => showToast(mensajeError(e), 'error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-full bg-slate-100 p-1 sm:w-fit">
        {([['inspecciones', 'Inspecciones y firmas'], ['hallazgos', 'Hallazgos']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setSub(k)}
            className={`flex-1 rounded-full px-4 py-2 text-center text-sm transition-colors sm:flex-none ${
              sub === k ? 'bg-card font-semibold text-brand shadow-sm dark:text-brand-cyan' : 'font-medium text-slate-600 hover:text-slate-900'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {sub === 'inspecciones' && (
        <>
          <div className="space-y-2">
            <h3 className="font-heading text-sm font-semibold text-slate-900">Inspecciones recientes</h3>
            {inspecciones === null ? <Cargando /> : inspecciones.length === 0 ? (
              <p className="text-sm text-slate-500">Sin inspecciones registradas.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Equipo</th>
                      <th className="px-3 py-2 font-medium">Modelo</th>
                      <th className="px-3 py-2 font-medium">Inspector</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspecciones.map((i) => (
                      <tr key={i.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 font-medium text-slate-900">{i.equipo}</td>
                        <td className="px-3 py-2 text-slate-600">{i.modelo}</td>
                        <td className="px-3 py-2 text-slate-600">{i.inspector}</td>
                        <td className="px-3 py-2">
                          <span className="text-slate-600">{i.estado === 'completada' ? 'Completada' : 'En curso'}</span>
                          {i.firmada === 1 && <ShieldCheck className="ml-1 inline h-4 w-4 text-green-600" aria-label="Firmada" />}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{fechaHoraCorta(i.fecha_inicio || i.fecha) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-heading text-sm font-semibold text-slate-900">Firmas y reaperturas</h3>
            {firmas === null ? <Cargando /> : firmas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin firmas registradas todavía.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Acción</th>
                      <th className="px-3 py-2 font-medium">Equipo</th>
                      <th className="px-3 py-2 font-medium">Usuario</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firmas.map((f) => (
                      <tr key={f.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${f.accion === 'firmada' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {f.accion === 'firmada' ? 'Firmada' : 'Reabierta'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-900">{f.equipo}</td>
                        <td className="px-3 py-2 text-slate-600">{f.usuario}</td>
                        <td className="px-3 py-2 text-slate-500">{fechaHoraCorta(f.timestamp) ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{f.motivo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {sub === 'hallazgos' && (
        hallazgos === null ? <Cargando /> : hallazgos.length === 0 ? (
          <p className="text-sm text-slate-500">Sin hallazgos registrados.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Equipo</th>
                  <th className="px-3 py-2 font-medium">Sistema / Sector</th>
                  <th className="px-3 py-2 font-medium">Criticidad</th>
                  <th className="px-3 py-2 font-medium">Inspector</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {hallazgos.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-600">{h.numero}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{h.equipo}</td>
                    <td className="px-3 py-2 text-slate-600">{[h.sistema, h.sector].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${critColor[h.criticidad] ?? 'bg-slate-100 text-slate-600'}`}>
                        {h.criticidad}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{h.inspector}</td>
                    <td className="px-3 py-2 text-slate-500">{fechaHoraCorta(h.fecha) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<'usuarios' | 'historial'>('usuarios');

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-xl font-semibold text-slate-900">Administración</h1>

      <div className="flex gap-1 rounded-full bg-slate-100 p-1 sm:w-fit">
        {([['usuarios', 'Usuarios'], ['historial', 'Historial']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 rounded-full px-5 py-2.5 text-center text-sm transition-colors sm:flex-none ${
              tab === k ? 'bg-card font-semibold text-brand shadow-sm dark:text-brand-cyan' : 'font-medium text-slate-600 hover:text-slate-900'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'usuarios' ? <SeccionUsuarios /> : <SeccionHistorial />}
    </div>
  );
}
