import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch, apiUpload, ApiError } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';

interface Diagrama {
  id: number;
  nombre: string;
  archivo: string;
  orden: number;
}

interface PaginaFija {
  titulo: string;
  contenido: string;
}

interface PlantillaDetalle {
  id: number;
  modelo: string;
  tipo: string | null;
  datos_generales: Record<string, string>;
  paginas_fijas: PaginaFija[];
  diagramas: Diagrama[];
}

interface DatoGeneral {
  clave: string;
  valor: string;
}

interface MensajeProps {
  tipo: 'ok' | 'error';
  texto: string;
}

function Mensaje({ tipo, texto }: MensajeProps) {
  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        tipo === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
      }`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      {texto}
    </div>
  );
}

export default function TemplateEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const esNueva = !id;
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cargando, setCargando] = useState(!esNueva);
  const [loadError, setLoadError] = useState('');
  const [plantillaId, setPlantillaId] = useState<number | null>(esNueva ? null : Number(id));

  const [modelo, setModelo] = useState('');
  const [tipo, setTipo] = useState('');
  const [datosGenerales, setDatosGenerales] = useState<DatoGeneral[]>([{ clave: '', valor: '' }]);
  const [paginasFijas, setPaginasFijas] = useState<PaginaFija[]>([{ titulo: '', contenido: '' }]);
  const [diagramas, setDiagramas] = useState<Diagrama[]>([]);

  const [msg, setMsg] = useState<MensajeProps | null>(null);
  const [msgDiagramas, setMsgDiagramas] = useState<MensajeProps | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoDiagrama, setSubiendoDiagrama] = useState(false);
  const [moviendoId, setMoviendoId] = useState<number | null>(null);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    if (esNueva) return;
    apiFetch<PlantillaDetalle>(`/plantillas/${id}`)
      .then((p) => {
        setPlantillaId(p.id);
        setModelo(p.modelo);
        setTipo(p.tipo || '');
        const entradas = Object.entries(p.datos_generales || {});
        setDatosGenerales(
          entradas.length ? entradas.map(([clave, valor]) => ({ clave, valor: String(valor) })) : [{ clave: '', valor: '' }]
        );
        setPaginasFijas(
          p.paginas_fijas?.length
            ? p.paginas_fijas.map((pg) => ({ titulo: pg.titulo || '', contenido: pg.contenido || '' }))
            : [{ titulo: '', contenido: '' }]
        );
        setDiagramas(p.diagramas || []);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'))
      .finally(() => setCargando(false));
  }, [id, esNueva]);

  function actualizarDato(idx: number, campo: keyof DatoGeneral, valor: string) {
    setDatosGenerales((prev) => prev.map((d, i) => (i === idx ? { ...d, [campo]: valor } : d)));
  }

  function agregarDato() {
    setDatosGenerales((prev) => [...prev, { clave: '', valor: '' }]);
  }

  function quitarDato(idx: number) {
    setDatosGenerales((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ clave: '', valor: '' }]));
  }

  function actualizarPagina(idx: number, campo: keyof PaginaFija, valor: string) {
    setPaginasFijas((prev) => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)));
  }

  function agregarPagina() {
    setPaginasFijas((prev) => [...prev, { titulo: '', contenido: '' }]);
  }

  function quitarPagina(idx: number) {
    setPaginasFijas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ titulo: '', contenido: '' }]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    const m = modelo.trim();
    if (!m) {
      setMsg({ tipo: 'error', texto: 'El modelo es obligatorio' });
      return;
    }

    const datos_generales: Record<string, string> = {};
    for (const { clave, valor } of datosGenerales) {
      const k = clave.trim();
      if (k) datos_generales[k] = valor;
    }
    const paginas_fijas = paginasFijas
      .filter(({ titulo, contenido }) => titulo.trim() || contenido.trim())
      .map(({ titulo, contenido }) => ({ titulo: titulo.trim(), contenido }));

    setGuardando(true);
    try {
      if (esNueva) {
        const creada = await apiFetch<PlantillaDetalle>('/plantillas', {
          method: 'POST',
          body: JSON.stringify({ modelo: m, tipo: tipo.trim(), datos_generales, paginas_fijas }),
        });
        navigate(`/plantillas/${creada.id}`);
      } else {
        const actualizada = await apiFetch<PlantillaDetalle>(`/plantillas/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ modelo: m, tipo: tipo.trim(), datos_generales, paginas_fijas }),
        });
        setModelo(actualizada.modelo);
        setTipo(actualizada.tipo || '');
        setMsg({ tipo: 'ok', texto: 'Plantilla guardada ✓' });
      }
    } catch (err) {
      setMsg({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardando(false);
    }
  }

  async function handleArchivoDiagrama(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !plantillaId) return;

    const base = file.name.replace(/\.[^.]+$/, '');
    const nombre = window.prompt('Nombre del diagrama (ej. Vista lateral)', base) ?? base;

    setSubiendoDiagrama(true);
    setMsgDiagramas({ tipo: 'ok', texto: 'Procesando imagen…' });
    try {
      const comprimida = await compressImage(file, { maxSide: 2400, quality: 0.85 });
      const formData = new FormData();
      formData.append('imagen', comprimida);
      if (nombre.trim()) formData.append('nombre', nombre.trim());
      setMsgDiagramas(null);
      const creado = await apiUpload<Diagrama>(`/plantillas/${plantillaId}/diagramas`, formData);
      setDiagramas((prev) => [...prev, creado]);
    } catch (err) {
      setMsgDiagramas({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error de conexión con el servidor' });
    } finally {
      setSubiendoDiagrama(false);
    }
  }

  async function eliminarDiagrama(diagramaId: number) {
    if (!plantillaId) return;
    if (!window.confirm('¿Quitar este diagrama de la plantilla?')) return;
    setMsgDiagramas(null);
    try {
      await apiFetch(`/plantillas/${plantillaId}/diagramas/${diagramaId}`, { method: 'DELETE' });
      setDiagramas((prev) => prev.filter((d) => d.id !== diagramaId));
    } catch (err) {
      setMsgDiagramas({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error de conexión con el servidor' });
    }
  }

  function actualizarNombreDiagrama(diagramaId: number, nombre: string) {
    setDiagramas((prev) => prev.map((d) => (d.id === diagramaId ? { ...d, nombre } : d)));
  }

  async function guardarNombreDiagrama(diagramaId: number, nombre: string) {
    if (!plantillaId) return;
    try {
      await apiFetch(`/plantillas/${plantillaId}/diagramas/${diagramaId}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre }),
      });
    } catch (err) {
      setMsgDiagramas({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error de conexión con el servidor' });
    }
  }

  async function moverDiagrama(idx: number, direccion: -1 | 1) {
    if (!plantillaId) return;
    const j = idx + direccion;
    if (j < 0 || j >= diagramas.length) return;
    const a = diagramas[idx];
    const b = diagramas[j];

    setMoviendoId(a.id);
    setMsgDiagramas(null);
    try {
      await Promise.all([
        apiFetch(`/plantillas/${plantillaId}/diagramas/${a.id}`, { method: 'PUT', body: JSON.stringify({ orden: b.orden }) }),
        apiFetch(`/plantillas/${plantillaId}/diagramas/${b.id}`, { method: 'PUT', body: JSON.stringify({ orden: a.orden }) }),
      ]);
      setDiagramas((prev) => {
        const next = [...prev];
        next[idx] = { ...b, orden: a.orden };
        next[j] = { ...a, orden: b.orden };
        return next.sort((x, y) => x.orden - y.orden || x.id - y.id);
      });
    } catch (err) {
      setMsgDiagramas({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error de conexión con el servidor' });
    } finally {
      setMoviendoId(null);
    }
  }

  async function eliminarPlantilla() {
    if (!plantillaId) return;
    if (!window.confirm('¿Eliminar esta plantilla? Esta acción no se puede deshacer.')) return;
    setEliminando(true);
    setMsg(null);
    try {
      await apiFetch(`/plantillas/${plantillaId}`, { method: 'DELETE' });
      navigate('/plantillas');
    } catch (err) {
      setMsg({ tipo: 'error', texto: err instanceof ApiError ? err.message : 'Error de conexión con el servidor' });
      setEliminando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
        <div className="font-semibold">No se pudo cargar la plantilla</div>
        {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/plantillas" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a plantillas
      </Link>

      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">
        {esNueva ? 'Nueva plantilla' : `Editar plantilla — ${modelo}`}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-card p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="modelo">Modelo de equipo</Label>
            <Input
              id="modelo"
              required
              placeholder="ej. CAEX 793F"
              className="h-11 bg-card"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <Input
              id="tipo"
              placeholder="ej. Camión minero"
              className="h-11 bg-card"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-2 font-heading text-base font-semibold text-slate-900">Datos generales</h2>
          <div className="flex flex-col gap-2">
            {datosGenerales.map((d, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  placeholder="Campo (ej. Marca)"
                  className="h-11 flex-1 bg-card"
                  value={d.clave}
                  onChange={(e) => actualizarDato(idx, 'clave', e.target.value)}
                />
                <Input
                  placeholder="Valor (ej. Caterpillar)"
                  className="h-11 flex-1 bg-card"
                  value={d.valor}
                  onChange={(e) => actualizarDato(idx, 'valor', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => quitarDato(idx)}
                  title="Quitar fila"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-300 hover:text-red-600"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={agregarDato}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar dato
          </Button>
        </div>

        <div>
          <h2 className="mb-2 font-heading text-base font-semibold text-slate-900">Páginas fijas del informe</h2>
          <div className="flex flex-col gap-3">
            {paginasFijas.map((p, idx) => (
              <div key={idx} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Título de la página"
                    className="h-11 flex-1 bg-card"
                    value={p.titulo}
                    onChange={(e) => actualizarPagina(idx, 'titulo', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => quitarPagina(idx)}
                    title="Quitar página"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:border-red-300 hover:text-red-600"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <Textarea
                  placeholder="Contenido"
                  rows={3}
                  className="bg-card"
                  value={p.contenido}
                  onChange={(e) => actualizarPagina(idx, 'contenido', e.target.value)}
                />
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={agregarPagina}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar página
          </Button>
        </div>

        {msg && <Mensaje {...msg} />}

        <Button type="submit" variant="gradient" disabled={guardando} className="h-12 w-full text-base">
          {guardando ? 'Guardando...' : 'Guardar plantilla'}
        </Button>
      </form>

      {!esNueva && plantillaId && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-card p-5 shadow-sm">
          <h2 className="mb-2 font-heading text-base font-semibold text-slate-900">Diagramas de referencia</h2>
          <p className="mb-3 text-sm text-slate-500">
            Se usan para marcar la ubicación de los hallazgos en este modelo de equipo.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {diagramas.map((d, idx) => (
              <div key={d.id} className="rounded-lg border border-slate-200 bg-card p-2">
                <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-slate-200">
                  <img
                    src={`/api/plantillas/${plantillaId}/diagramas/${d.id}/imagen`}
                    alt={d.nombre}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => eliminarDiagrama(d.id)}
                    title="Quitar diagrama"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition-colors hover:bg-white hover:text-red-600"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <Input
                  className="mt-1.5 h-9 bg-card text-sm"
                  value={d.nombre}
                  onChange={(e) => actualizarNombreDiagrama(d.id, e.target.value)}
                  onBlur={(e) => guardarNombreDiagrama(d.id, e.target.value.trim())}
                />
                <div className="mt-1.5 flex justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => moverDiagrama(idx, -1)}
                    disabled={idx === 0 || moviendoId !== null}
                    title="Mover antes"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-brand hover:text-brand disabled:opacity-30"
                  >
                    {moviendoId === d.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => moverDiagrama(idx, 1)}
                    disabled={idx === diagramas.length - 1 || moviendoId !== null}
                    title="Mover después"
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-brand hover:text-brand disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={subiendoDiagrama}
              className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand hover:text-brand"
            >
              {subiendoDiagrama ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-6 w-6" aria-hidden="true" />}
              <span className="text-sm font-medium">Agregar diagrama</span>
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleArchivoDiagrama} />

          {msgDiagramas && <div className="mt-2.5"><Mensaje {...msgDiagramas} /></div>}
        </div>
      )}

      {!esNueva && plantillaId && (
        <div className="mt-4 rounded-xl border border-red-200 bg-card p-5 shadow-sm">
          <h2 className="mb-2 font-heading text-base font-bold text-red-700">Zona de peligro</h2>
          <p className="mb-3 text-sm text-slate-500">
            Solo se puede eliminar si ninguna inspección usa esta plantilla.
          </p>
          <Button type="button" variant="destructive" disabled={eliminando} onClick={eliminarPlantilla}>
            {eliminando ? 'Eliminando...' : 'Eliminar plantilla'}
          </Button>
        </div>
      )}
    </div>
  );
}
