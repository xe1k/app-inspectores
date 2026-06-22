import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Camera, ChevronDown, ChevronUp, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import PhotoEditorDialog, { type PhotoEditorResult } from '@/components/PhotoEditorDialog';
import ZonaSelector, { type Zona } from '@/components/ZonaSelector';
import DiagramaMarcador, { type Diagrama } from '@/components/DiagramaMarcador';
import { formatHoras, formatPersonas, parseCantidad } from '@/lib/formatHallazgo';
import { apiFetch, apiUpload, ApiError } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';

interface Foto {
  id: number;
  archivo: string;
  orden: number;
}

interface Marca {
  id: number;
  diagrama_id: number;
  x_pct: number;
  y_pct: number;
}

interface Hallazgo {
  id: number;
  numero: number;
  inspeccion_id: number;
  criticidad: 'alta' | 'media' | 'baja' | string;
  preexistencia: 'si' | 'no' | 'na' | string | null;
  tipo_dano: string | null;
  zona_id: number | null;
  sistema: string | null;
  sector: string | null;
  codigo: string | null;
  descripcion_dano: string | null;
  trabajo_realizar: string | null;
  recomendacion: string | null;
  tiempo_reparacion: string | null;
  recursos: string | null;
  fotos: Foto[];
  marcas: Marca[];
}

interface Inspeccion {
  id: number;
  equipo: string;
  estado: 'en_curso' | 'completada' | string;
  plantilla_id: number;
}

interface Plantilla {
  id: number;
  diagramas: Diagrama[];
}

const CRITICIDADES: { valor: 'alta' | 'media' | 'baja'; etiqueta: string; activo: string }[] = [
  { valor: 'alta', etiqueta: 'Alta', activo: 'border-red-600 bg-red-100 text-red-600' },
  { valor: 'media', etiqueta: 'Media', activo: 'border-amber-500 bg-amber-100 text-amber-800' },
  { valor: 'baja', etiqueta: 'Baja', activo: 'border-green-600 bg-green-100 text-green-600' },
];

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

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <div className="text-base font-medium text-slate-900">{children}</div>
    </div>
  );
}

export default function FindingPage() {
  const { inspeccionId, hallazgoId } = useParams<{ inspeccionId: string; hallazgoId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<HTMLDivElement>(null);
  const marcasRef = useRef<HTMLDivElement>(null);
  const aplicoMarcarRef = useRef(false);

  const [hallazgo, setHallazgo] = useState<Hallazgo | null>(null);
  const [inspeccion, setInspeccion] = useState<Inspeccion | null>(null);
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [loadError, setLoadError] = useState('');

  const [criticidad, setCriticidad] = useState<'alta' | 'media' | 'baja' | null>(null);
  const [tipoDano, setTipoDano] = useState('');
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [zonaId, setZonaId] = useState<number | null>(null);
  const [sistema, setSistema] = useState('');
  const [sector, setSector] = useState('');
  const [codigo, setCodigo] = useState('');
  const [descripcionDano, setDescripcionDano] = useState('');
  const [trabajoRealizar, setTrabajoRealizar] = useState('');
  const [recomendacion, setRecomendacion] = useState('');
  const [tiempoReparacion, setTiempoReparacion] = useState('');
  const [recursos, setRecursos] = useState('');
  const [preexistencia, setPreexistencia] = useState('');

  const [msg, setMsg] = useState<MensajeProps | null>(null);
  const [msgFotos, setMsgFotos] = useState<MensajeProps | null>(null);
  const [msgMarcas, setMsgMarcas] = useState<MensajeProps | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoVersion, setFotoVersion] = useState(0);
  const [diagramaActivo, setDiagramaActivo] = useState<number | null>(null);
  const [editandoTerreno, setEditandoTerreno] = useState(false);
  const [informeAbierto, setInformeAbierto] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 640
  );
  const [resaltarMarcas, setResaltarMarcas] = useState(false);
  const [editorArchivo, setEditorArchivo] = useState<File | null>(null);
  const [editorFotoId, setEditorFotoId] = useState<number | null>(null);
  const [anotandoFotoId, setAnotandoFotoId] = useState<number | null>(null);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hallazgoId, inspeccionId]);

  // Entrada directa al marcado de diagrama (?marcar=1, ver pantalla de éxito del wizard).
  useEffect(() => {
    if (aplicoMarcarRef.current) return;
    if (searchParams.get('marcar') === '1' && hallazgo && marcasRef.current) {
      aplicoMarcarRef.current = true;
      marcasRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setResaltarMarcas(true);
      setTimeout(() => setResaltarMarcas(false), 2000);
      const url = new URL(window.location.href);
      url.searchParams.delete('marcar');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [searchParams, hallazgo]);

  // Si la zona elegida tiene coordenadas, mostrar automáticamente su diagrama
  useEffect(() => {
    if (zonaId == null) return;
    const z = zonas.find((x) => x.id === zonaId);
    if (z && z.diagrama_id != null && z.coord_x != null && z.coord_y != null) {
      setDiagramaActivo(z.diagrama_id);
    }
  }, [zonaId, zonas]);

  async function cargar() {
    try {
      let h: Hallazgo | null = null;
      if (hallazgoId) {
        h = await apiFetch<Hallazgo>(`/hallazgos/${hallazgoId}`);
      }
      const insp = await apiFetch<Inspeccion>(`/inspecciones/${inspeccionId}`);
      const plant = await apiFetch<Plantilla>(`/plantillas/${insp.plantilla_id}`);
      setInspeccion(insp);
      setPlantilla(plant);
      try {
        setZonas(await apiFetch<Zona[]>(`/plantillas/${insp.plantilla_id}/zonas`));
      } catch {
        setZonas([]); // sin catálogo: se usan los campos de texto libre
      }
      if (h) {
        setHallazgo(h);
        setCriticidad((h.criticidad as 'alta' | 'media' | 'baja') || null);
        setTipoDano(h.tipo_dano || '');
        setZonaId(h.zona_id ?? null);
        setSistema(h.sistema || '');
        setSector(h.sector || '');
        setCodigo(h.codigo || '');
        setDescripcionDano(h.descripcion_dano || '');
        setTrabajoRealizar(h.trabajo_realizar || '');
        setRecomendacion(h.recomendacion || '');
        setTiempoReparacion(parseCantidad(h.tiempo_reparacion)?.toString() ?? '');
        setRecursos(parseCantidad(h.recursos)?.toString() ?? '');
        setPreexistencia(h.preexistencia || '');
      }
      if (plant.diagramas.length) setDiagramaActivo(plant.diagramas[0].id);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
    }
  }

  async function recargarHallazgo() {
    if (!hallazgoId) return;
    const h = await apiFetch<Hallazgo>(`/hallazgos/${hallazgoId}`);
    setHallazgo(h);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!criticidad) {
      setMsg({ tipo: 'error', texto: 'Selecciona la criticidad del hallazgo' });
      return;
    }
    setGuardando(true);
    setMsg(null);
    const cuerpo = {
      criticidad,
      tipo_dano: tipoDano.trim(),
      zona_id: zonaId,
      sistema: sistema.trim(),
      sector: sector.trim(),
      codigo: codigo.trim(),
      descripcion_dano: descripcionDano.trim(),
      trabajo_realizar: trabajoRealizar.trim(),
      recomendacion: recomendacion.trim(),
      tiempo_reparacion: tiempoReparacion.trim(),
      recursos: recursos.trim(),
      preexistencia: preexistencia || null,
    };
    try {
      const actualizado = await apiFetch<Hallazgo>(`/hallazgos/${hallazgoId}`, {
        method: 'PUT',
        body: JSON.stringify(cuerpo),
      });
      setHallazgo(actualizado);
      setMsg({ tipo: 'ok', texto: 'Cambios guardados' });
      setEditandoTerreno(false);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarHallazgo() {
    if (!hallazgo || !inspeccionId) return;
    if (!confirm(`¿Eliminar el hallazgo N°${hallazgo.numero}? Esta acción no se puede deshacer.`)) return;
    try {
      await apiFetch(`/hallazgos/${hallazgoId}`, { method: 'DELETE' });
      navigate(`/inspecciones/${inspeccionId}`);
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  async function subirFoto(file: File) {
    if (!hallazgoId) return;
    setSubiendoFoto(true);
    setMsgFotos({ tipo: 'ok', texto: 'Procesando foto…' });
    try {
      const comprimida = await compressImage(file);
      const datos = new FormData();
      datos.append('foto', comprimida);
      setMsgFotos({ tipo: 'ok', texto: 'Subiendo foto…' });
      await apiUpload(`/hallazgos/${hallazgoId}/fotos`, datos);
      await recargarHallazgo();
      setFotoVersion((v) => v + 1);
      setMsgFotos({ tipo: 'ok', texto: 'Foto agregada' });
    } catch (e) {
      setMsgFotos({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setSubiendoFoto(false);
    }
  }

  function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) {
      setEditorFotoId(null);
      setEditorArchivo(archivo);
    }
  }

  async function eliminarFoto(fotoId: number) {
    if (!hallazgoId) return;
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      await apiFetch(`/hallazgos/${hallazgoId}/fotos/${fotoId}`, { method: 'DELETE' });
      await recargarHallazgo();
    } catch (e) {
      setMsgFotos({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  async function anotarFoto(fotoId: number) {
    if (!hallazgoId) return;
    setAnotandoFotoId(fotoId);
    try {
      const resp = await fetch(`/api/hallazgos/${hallazgoId}/fotos/${fotoId}/imagen?t=${fotoVersion}`, { credentials: 'include' });
      if (!resp.ok) throw new Error('No se pudo cargar la foto');
      const blob = await resp.blob();
      const archivo = new File([blob], `foto_${fotoId}.jpg`, { type: blob.type || 'image/jpeg' });
      setEditorFotoId(fotoId);
      setEditorArchivo(archivo);
    } catch (e) {
      setMsgFotos({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setAnotandoFotoId(null);
    }
  }

  async function reemplazarFoto(fotoId: number, file: File) {
    if (!hallazgoId) return;
    setSubiendoFoto(true);
    setMsgFotos({ tipo: 'ok', texto: 'Procesando foto…' });
    try {
      const comprimida = await compressImage(file);
      const datos = new FormData();
      datos.append('foto', comprimida);
      setMsgFotos({ tipo: 'ok', texto: 'Guardando foto anotada…' });
      await apiUpload(`/hallazgos/${hallazgoId}/fotos/${fotoId}`, datos, 'PUT');
      await recargarHallazgo();
      setFotoVersion((v) => v + 1);
      setMsgFotos({ tipo: 'ok', texto: 'Foto actualizada' });
    } catch (e) {
      setMsgFotos({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setSubiendoFoto(false);
    }
  }

  function handleEditorConfirm(resultado: PhotoEditorResult) {
    const fotoId = editorFotoId;
    setEditorArchivo(null);
    setEditorFotoId(null);
    if (fotoId == null) {
      subirFoto(resultado.archivo);
    } else {
      reemplazarFoto(fotoId, resultado.archivo);
    }
  }

  function handleEditorCancel() {
    setEditorArchivo(null);
    setEditorFotoId(null);
  }

  async function adjuntarDiagrama(d: Diagrama) {
    if (!hallazgoId || !plantilla) return;
    setMsgFotos({ tipo: 'ok', texto: 'Adjuntando diagrama…' });
    try {
      const resp = await fetch(`/api/plantillas/${plantilla.id}/diagramas/${d.id}/imagen`, { credentials: 'include' });
      if (!resp.ok) throw new Error('No se pudo obtener el diagrama');
      const blob = await resp.blob();
      const nombre = d.nombre.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'diagrama';
      const archivo = new File([blob], `${nombre}.jpg`, { type: blob.type || 'image/jpeg' });
      const datos = new FormData();
      datos.append('foto', archivo);
      await apiUpload(`/hallazgos/${hallazgoId}/fotos`, datos);
      await recargarHallazgo();
      setFotoVersion((v) => v + 1);
      setMsgFotos({ tipo: 'ok', texto: 'Diagrama adjuntado como foto' });
    } catch (e) {
      setMsgFotos({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error de conexión con el servidor' });
    }
  }

  async function agregarMarca(x_pct: number, y_pct: number) {
    if (!hallazgoId || diagramaActivo == null) return;
    try {
      await apiFetch(`/hallazgos/${hallazgoId}/marcas`, {
        method: 'POST',
        body: JSON.stringify({ diagrama_id: diagramaActivo, x_pct, y_pct }),
      });
      await recargarHallazgo();
      setMsgMarcas(null);
    } catch (e) {
      setMsgMarcas({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  async function eliminarMarca(marcaId: number) {
    if (!hallazgoId) return;
    if (!confirm('¿Eliminar esta marca del diagrama?')) return;
    try {
      await apiFetch(`/hallazgos/${hallazgoId}/marcas/${marcaId}`, { method: 'DELETE' });
      await recargarHallazgo();
    } catch (e) {
      setMsgMarcas({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  if (loadError) {
    return (
      <div>
        <Link to={`/inspecciones/${inspeccionId}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>
        <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
          <div className="font-semibold">No se pudo cargar el hallazgo</div>
          {loadError}
        </div>
      </div>
    );
  }

  if (!inspeccion || !plantilla || !hallazgo) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  const completada = inspeccion.estado === 'completada';
  const diagramas = plantilla.diagramas || [];

  // Selector de zonas: solo si la plantilla tiene catálogo y los valores del
  // hallazgo calzan con él (datos antiguos de texto libre siguen en inputs).
  const usarSelectorZonas =
    zonas.length > 0 &&
    (zonaId != null ||
      (!sistema && !sector && !codigo) ||
      zonas.some((z) => z.sistema === sistema && z.sector === sector && z.codigo === codigo));

  // Zona elegida con coordenadas: referencia visual sobre el diagrama
  const zonaConCoordenadas = (() => {
    const z = zonaId != null ? zonas.find((x) => x.id === zonaId) : null;
    return z && z.diagrama_id != null && z.coord_x != null && z.coord_y != null ? z : null;
  })();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link to={`/inspecciones/${inspeccionId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>
      </div>

      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">
        Hallazgo N°{hallazgo.numero} — {inspeccion.equipo}
      </h1>

      {criticidad && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <span className={`inline-block whitespace-nowrap rounded-full border-2 px-3 py-1.5 text-sm font-bold ${
            CRITICIDADES.find((c) => c.valor === criticidad)?.activo || 'border-slate-200 text-slate-700'
          }`}>
            Criticidad {CRITICIDADES.find((c) => c.valor === criticidad)?.etiqueta}
          </span>
        </div>
      )}

      {msg && <div className="mb-3"><Mensaje {...msg} /></div>}

      <form onSubmit={guardar}>
        {/* SECCIÓN A: Datos de terreno */}
        <div className="rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-heading text-base font-semibold text-slate-900">Datos de terreno</h2>
            {!completada && !editandoTerreno && (
              <button
                type="button"
                onClick={() => setEditandoTerreno(true)}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand dark:text-brand-cyan"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar datos de terreno
              </button>
            )}
          </div>

          {editandoTerreno ? (
            <>
              <h3 className="mb-2 font-heading text-sm font-semibold text-slate-900">Criticidad</h3>
              <div className="mb-4 flex gap-2.5">
                {CRITICIDADES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    disabled={completada}
                    onClick={() => setCriticidad(c.valor)}
                    className={`flex h-14 flex-1 items-center justify-center rounded-lg border-2 font-heading text-base font-bold transition-colors ${
                      criticidad === c.valor ? c.activo : 'border-slate-200 bg-card text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {c.etiqueta}
                  </button>
                ))}
              </div>

              <h3 className="mb-2 font-heading text-sm font-semibold text-slate-900">Ubicación del hallazgo</h3>
              {usarSelectorZonas ? (
                <div className="mb-4">
                  <ZonaSelector
                    zonas={zonas}
                    valor={{ sistema, sector, codigo, zona_id: zonaId }}
                    onChange={(sel) => {
                      setSistema(sel.sistema);
                      setSector(sel.sector);
                      setCodigo(sel.codigo);
                      setZonaId(sel.zona_id);
                    }}
                    criticidadActual={criticidad}
                    onAplicarCriticidad={setCriticidad}
                    disabled={completada}
                  />
                </div>
              ) : (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="sistema">Sistema</Label>
                    <Input id="sistema" className="h-11 bg-card" placeholder="ej. Chasis, Tolva, Estructura" value={sistema} onChange={(e) => setSistema(e.target.value)} disabled={completada} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sector">Sector</Label>
                    <Input id="sector" className="h-11 bg-card" placeholder="ej. Bastidores derecho e izquierdo" value={sector} onChange={(e) => setSector(e.target.value)} disabled={completada} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="codigo">Código</Label>
                    <Input id="codigo" className="h-11 bg-card" placeholder="ej. ZA01LHO" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={completada} />
                  </div>
                </div>
              )}

              <div className="mb-4 space-y-1.5">
                <Label htmlFor="tipoDano">Tipo de daño</Label>
                <Input id="tipoDano" className="h-11 bg-card" placeholder="ej. Fisura, Corrosión, Deformación…" value={tipoDano} onChange={(e) => setTipoDano(e.target.value)} disabled={completada} />
              </div>

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tiempoReparacion">Tiempo estimado (horas)</Label>
                  <Input id="tiempoReparacion" type="number" inputMode="numeric" min="0" max="999" className="h-11 bg-card" placeholder="ej. 12" value={tiempoReparacion} onChange={(e) => setTiempoReparacion(e.target.value)} disabled={completada} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recursos">Personas requeridas</Label>
                  <Input id="recursos" type="number" inputMode="numeric" min="0" max="99" className="h-11 bg-card" placeholder="ej. 2" value={recursos} onChange={(e) => setRecursos(e.target.value)} disabled={completada} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preexistencia">Preexistencia del daño</Label>
                  <select
                    id="preexistencia"
                    className="flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    value={preexistencia}
                    onChange={(e) => setPreexistencia(e.target.value)}
                    disabled={completada}
                  >
                    <option value="">— Selecciona —</option>
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                    <option value="na">N/A</option>
                  </select>
                </div>
              </div>

              {!completada && (
                <div className="flex gap-2.5">
                  <Button type="submit" variant="gradient" className="h-12 flex-1 text-base" disabled={guardando}>
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                    Guardar cambios
                  </Button>
                  <button
                    type="button"
                    onClick={() => { cargar(); setEditandoTerreno(false); }}
                    className="rounded-full px-4 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Dato etiqueta="Criticidad">
                {criticidad ? (
                  <span className={`inline-block rounded-full border-2 px-3 py-1 font-heading font-bold ${
                    CRITICIDADES.find((c) => c.valor === criticidad)?.activo || 'border-slate-200 text-slate-700'
                  }`}>
                    {CRITICIDADES.find((c) => c.valor === criticidad)?.etiqueta}
                  </span>
                ) : '—'}
              </Dato>
              <Dato etiqueta="Tipo de daño">{tipoDano || '—'}</Dato>
              <Dato etiqueta="Ubicación">
                {sistema || '—'}{sector ? ` — ${sector}` : ''}
                {codigo && <span className="mt-0.5 block text-sm font-normal text-slate-600">Código {codigo}</span>}
              </Dato>
              <Dato etiqueta="Tiempo estimado">{formatHoras(tiempoReparacion)}</Dato>
              <Dato etiqueta="Personas requeridas">{formatPersonas(recursos)}</Dato>
              <Dato etiqueta="Preexistencia">
                {preexistencia === 'si' ? 'Sí' : preexistencia === 'no' ? 'No' : preexistencia === 'na' ? 'N/A' : '—'}
              </Dato>
            </div>
          )}
        </div>

        {/* SECCIÓN B: Informe (oficina) */}
        <div className="mt-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setInformeAbierto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <h2 className="font-heading text-base font-semibold text-slate-900">
              Informe (oficina){!informeAbierto ? ' — completar en escritorio' : ''}
            </h2>
            {informeAbierto ? (
              <ChevronUp className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            )}
          </button>

          {informeAbierto && (
            <div className="mt-3 flex flex-col gap-3">
              {!descripcionDano && !trabajoRealizar && !recomendacion && (
                <p className="text-sm text-slate-500">Estos campos se completan al redactar el informe final.</p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="descripcionDano">Observación / descripción del daño</Label>
                <Textarea id="descripcionDano" rows={3} className="bg-card" placeholder="Describe lo observado: tipo de daño, dimensiones, ubicación exacta…" value={descripcionDano} onChange={(e) => setDescripcionDano(e.target.value)} disabled={completada} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trabajoRealizar">Trabajo a realizar</Label>
                <Textarea id="trabajoRealizar" rows={2} className="bg-card" placeholder="ej. Reparación mediante procedimiento X, cambio de pieza, evaluación por fabricante…" value={trabajoRealizar} onChange={(e) => setTrabajoRealizar(e.target.value)} disabled={completada} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recomendacion">Recomendación</Label>
                <Textarea id="recomendacion" rows={2} className="bg-card" placeholder="ej. Apoyo con plataforma, sector limpio, repuesto adecuado…" value={recomendacion} onChange={(e) => setRecomendacion(e.target.value)} disabled={completada} />
              </div>

              {!completada && (
                <Button type="submit" variant="gradient" className="h-12 w-full text-base" disabled={guardando}>
                  {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Guardar cambios
                </Button>
              )}
            </div>
          )}
        </div>
      </form>

      {/* Fotos */}
      <div ref={fotosRef} className="mt-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900">Fotografías del daño</h2>
          <p className="-mt-0.5 mb-2 text-sm text-slate-500">Fotos tomadas en terreno que respaldan este hallazgo.</p>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {hallazgo.fotos.map((f) => (
              <div key={f.id} className="relative aspect-square overflow-hidden rounded-lg bg-slate-200">
                <img
                  src={`/api/hallazgos/${hallazgoId}/fotos/${f.id}/imagen?t=${fotoVersion}`}
                  alt="Foto del hallazgo"
                  className="h-full w-full object-cover"
                />
                {!completada && (
                  <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => anotarFoto(f.id)}
                      disabled={anotandoFotoId === f.id}
                      title="Anotar foto"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition-colors hover:bg-white hover:text-brand"
                    >
                      {anotandoFotoId === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => eliminarFoto(f.id)}
                      title="Quitar"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow transition-colors hover:bg-white hover:text-red-600"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {!completada && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={subiendoFoto}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand hover:text-brand"
              >
                {subiendoFoto ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Camera className="h-6 w-6" aria-hidden="true" />}
                <span className="text-sm font-medium">Agregar foto</span>
              </button>
            )}
          </div>

          {hallazgo.fotos.length === 0 && completada && (
            <p className="text-sm text-slate-400">Sin fotos.</p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={handleArchivoChange}
          />

          {msgFotos && <div className="mt-2.5"><Mensaje {...msgFotos} /></div>}

          {/* Adjuntar diagrama como foto */}
          {!completada && diagramas.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-slate-500">Adjuntar diagrama de referencia como imagen del informe:</p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {diagramas.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => adjuntarDiagrama(d)}
                    className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 text-center transition-colors hover:border-brand"
                  >
                    <img
                      src={`/api/plantillas/${plantilla.id}/diagramas/${d.id}/imagen`}
                      alt={d.nombre}
                      className="absolute inset-0 h-full w-full object-cover opacity-60"
                    />
                    <span className="relative px-1 text-xs font-medium text-slate-700">{d.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>

      {/* Marcado en diagramas */}
      <div ref={marcasRef} className={`mt-3 rounded-xl border bg-card p-4 shadow-sm transition-all ${resaltarMarcas ? 'border-brand ring-2 ring-brand/30 animate-pulse' : 'border-slate-200'}`}>
          <h2 className="font-heading text-base font-semibold text-slate-900">Marca la ubicación en el diagrama</h2>
          <p className="-mt-0.5 mb-2 text-sm text-slate-500">
            Toca el punto exacto del diagrama donde se encuentra el daño. Quedará marcado con el N° de este hallazgo.
          </p>

          <DiagramaMarcador
            plantillaId={plantilla.id}
            diagramas={diagramas}
            diagramaActivo={diagramaActivo}
            onSeleccionarDiagrama={setDiagramaActivo}
            marcas={hallazgo.marcas}
            onAgregarMarca={agregarMarca}
            onEliminarMarca={(m) => { if (m.id != null) eliminarMarca(m.id); }}
            zonaConCoordenadas={zonaConCoordenadas}
            etiquetaMarca={hallazgo.numero}
            readOnly={completada}
            ayuda={completada
              ? 'Esta inspección está completada; las marcas no se pueden modificar.'
              : `Toca sobre la imagen para marcar dónde se encuentra el hallazgo N°${hallazgo.numero}. Toca una marca existente para eliminarla.`}
          />

          {msgMarcas && <div className="mt-2"><Mensaje {...msgMarcas} /></div>}
      </div>

      {/* Volver */}
      <Link
        to={`/inspecciones/${inspeccionId}`}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
      >
        {completada ? '← Volver a la inspección' : '✓ Listo, volver a la inspección'}
      </Link>

      {/* Eliminar */}
      {!completada && (
        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
          <button type="button" onClick={eliminarHallazgo} className="text-sm font-medium text-red-600 hover:underline">
            Eliminar este hallazgo…
          </button>
        </div>
      )}

      {editorArchivo && (
        <PhotoEditorDialog
          archivo={editorArchivo}
          titulo={editorFotoId == null ? 'Resalta el punto importante de la foto' : 'Anotar foto'}
          onCancel={handleEditorCancel}
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  );
}
