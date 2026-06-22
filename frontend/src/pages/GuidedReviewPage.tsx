import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, Check, Loader2, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import PhotoEditorDialog, { type PhotoEditorResult } from '@/components/PhotoEditorDialog';
import FirmarInspeccionDialog from '@/components/FirmarInspeccionDialog';
import { type Zona } from '@/components/ZonaSelector';
import { type Diagrama } from '@/components/DiagramaMarcador';
import HallazgoWizardForm, { type ExitoHallazgo } from '@/components/hallazgo-wizard/HallazgoWizardForm';
import { apiFetch, apiUpload, ApiError } from '@/lib/api';

interface Foto {
  id: number;
  archivo: string;
  orden: number;
}

interface HallazgoRevision {
  id: number;
  numero: number;
  criticidad: string;
  sistema: string | null;
  sector: string | null;
  descripcion_dano: string | null;
  trabajo_realizar: string | null;
  estado_revision: 'persiste' | 'resuelto' | 'nuevo' | null;
  nota_revision: string | null;
  hallazgo_origen_id: number | null;
  fotos: Foto[];
  fotos_anteriores: Foto[];
}

interface Inspeccion {
  id: number;
  equipo: string;
  ot: string | null;
  estado: string;
  inspeccion_base_id: number | null;
  foto_portada: string | null;
  plantilla_id: number;
  hallazgos: { id: number }[];
}

type Fase = 'portada' | 'revisar' | 'nuevos' | 'listo';

const CRITICIDAD_LABEL: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const CRITICIDAD_COLOR: Record<string, string> = { alta: '#b91c1c', media: '#d97706', baja: '#15803d' };
const CRITICIDAD_BADGE: Record<string, string> = {
  alta: 'bg-red-100 text-red-600',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-green-100 text-green-600',
};

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

export default function GuidedReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const portadaInputRef = useRef<HTMLInputElement>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [insp, setInsp] = useState<Inspeccion | null>(null);
  const [hallazgos, setHallazgos] = useState<HallazgoRevision[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [diagramas, setDiagramas] = useState<Diagrama[]>([]);
  const [loadError, setLoadError] = useState('');

  const [fase, setFase] = useState<Fase>('portada');
  const [paso, setPaso] = useState(0);
  const [nota, setNota] = useState('');
  const [guardandoPaso, setGuardandoPaso] = useState(false);
  const [msgPaso, setMsgPaso] = useState<MensajeProps | null>(null);

  const [mostrarWizard, setMostrarWizard] = useState(false);

  const [modalFirmaAbierto, setModalFirmaAbierto] = useState(false);

  const [fotoVersion, setFotoVersion] = useState(0);
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const [portadaAnteriorOk, setPortadaAnteriorOk] = useState(true);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [editorArchivo, setEditorArchivo] = useState<File | null>(null);
  const [editorHallazgoId, setEditorHallazgoId] = useState<number | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargar() {
    try {
      const i = await apiFetch<Inspeccion>(`/inspecciones/${id}`);
      const hs = await Promise.all(i.hallazgos.map((h) => apiFetch<HallazgoRevision>(`/hallazgos/${h.id}`)));
      setInsp(i);
      setHallazgos(hs);
      setNota(hs[0]?.nota_revision || '');
      try {
        setZonas(await apiFetch<Zona[]>(`/plantillas/${i.plantilla_id}/zonas`));
      } catch {
        setZonas([]);
      }
      try {
        const plant = await apiFetch<{ id: number; diagramas: Diagrama[] }>(`/plantillas/${i.plantilla_id}`);
        setDiagramas(plant.diagramas || []);
      } catch {
        setDiagramas([]);
      }
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
    }
  }

  async function refrescarHallazgo(hallazgoId: number) {
    const actualizado = await apiFetch<HallazgoRevision>(`/hallazgos/${hallazgoId}`);
    setHallazgos((prev) => {
      const idx = prev.findIndex((x) => x.id === actualizado.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = actualizado;
        return copia;
      }
      return [...prev, actualizado];
    });
    return actualizado;
  }

  async function marcarEstado(estado: 'persiste' | 'resuelto') {
    const h = hallazgos[paso];
    setMsgPaso(null);
    try {
      const actualizado = await apiFetch<HallazgoRevision>(`/hallazgos/${h.id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado_revision: estado }),
      });
      setHallazgos((prev) => prev.map((x, i) => (i === paso ? actualizado : x)));
      setNota(actualizado.nota_revision || '');
    } catch (e) {
      setMsgPaso({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  async function guardarYSiguiente() {
    const h = hallazgos[paso];
    setGuardandoPaso(true);
    setMsgPaso(null);
    try {
      const notaTrim = nota.trim();
      await apiFetch(`/hallazgos/${h.id}`, { method: 'PUT', body: JSON.stringify({ nota_revision: notaTrim }) });
      setHallazgos((prev) => prev.map((x, i) => (i === paso ? { ...x, nota_revision: notaTrim || null } : x)));
      if (paso + 1 >= hallazgos.length) {
        setFase('nuevos');
      } else {
        setNota(hallazgos[paso + 1]?.nota_revision || '');
        setPaso(paso + 1);
      }
    } catch (e) {
      setMsgPaso({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardandoPaso(false);
    }
  }

  async function eliminarFoto(hallazgoId: number, fotoId: number) {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      await apiFetch(`/hallazgos/${hallazgoId}/fotos/${fotoId}`, { method: 'DELETE' });
      await refrescarHallazgo(hallazgoId);
    } catch {
      // el listado simplemente no se actualiza; el usuario puede reintentar
    }
  }

  function abrirCamara(hallazgoId: number) {
    setEditorHallazgoId(hallazgoId);
    fotoInputRef.current?.click();
  }

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) setEditorArchivo(archivo);
  }

  function handleEditorConfirm(resultado: PhotoEditorResult) {
    const hid = editorHallazgoId;
    setEditorArchivo(null);
    setEditorHallazgoId(null);
    if (hid != null) subirFoto(hid, resultado.archivo);
  }

  function handleEditorCancel() {
    setEditorArchivo(null);
    setEditorHallazgoId(null);
  }

  async function subirFoto(hallazgoId: number, file: File) {
    setSubiendoFoto(true);
    try {
      const datos = new FormData();
      datos.append('foto', file);
      await apiUpload(`/hallazgos/${hallazgoId}/fotos`, datos);
      await refrescarHallazgo(hallazgoId);
      setFotoVersion((v) => v + 1);
    } catch {
      // si falla, el usuario puede reintentar con "Agregar foto"
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function handlePortadaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendoPortada(true);
    try {
      const datos = new FormData();
      datos.append('foto', archivo);
      await apiUpload(`/inspecciones/${id}/foto`, datos);
      const actualizada = await apiFetch<Inspeccion>(`/inspecciones/${id}`);
      setInsp(actualizada);
      setFotoVersion((v) => v + 1);
    } catch {
      // si falla, el usuario puede reintentar
    } finally {
      setSubiendoPortada(false);
    }
  }

  async function manejarHallazgoGuardado(exito: ExitoHallazgo) {
    try {
      const nuevo = await apiFetch<HallazgoRevision>(`/hallazgos/${exito.hallazgoId}`, {
        method: 'PUT',
        body: JSON.stringify({ estado_revision: 'nuevo' }),
      });
      setHallazgos((prev) => [...prev, nuevo]);
    } catch {
      // si falla, el hallazgo ya quedó guardado en el servidor (sin marcar como "nuevo")
    }
  }

  function handleFirmada() {
    navigate(`/inspecciones/${id}`);
  }

  if (loadError) {
    return (
      <div>
        <Link to={`/inspecciones/${id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          ← Volver
        </Link>
        <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
          <div className="font-semibold">No se pudo cargar la revisión</div>
          {loadError}
        </div>
      </div>
    );
  }

  if (!insp) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
      </div>
    );
  }

  const linkSalir = (
    <p className="mt-3 text-center text-sm text-slate-500">
      <Link to={`/inspecciones/${id}`} className="underline">
        Salir — tu avance queda guardado
      </Link>
    </p>
  );

  function renderPortada() {
    const baseId = insp!.inspeccion_base_id;
    const tienePortadaNueva = !!insp!.foto_portada;
    return (
      <>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
          <div className="bg-brand px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-white">Foto de portada</span>
          </div>
          <div className="p-4">
            <p className="mb-3 text-sm text-slate-700">
              ¿Quieres tomar una foto nueva del equipo o usar la de la inspección anterior?
            </p>

            {baseId && portadaAnteriorOk && (
              <>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Foto anterior</p>
                <div className="mb-3">
                  <img
                    src={`/api/inspecciones/${baseId}/foto?t=${fotoVersion}`}
                    alt="Foto de la inspección anterior"
                    className="max-h-56 max-w-full cursor-zoom-in rounded-lg border border-slate-200 object-contain"
                    onClick={(e) => setFotoAmpliada((e.target as HTMLImageElement).src)}
                    onError={() => setPortadaAnteriorOk(false)}
                  />
                </div>
              </>
            )}
            {baseId && !portadaAnteriorOk && (
              <p className="mb-3 text-sm text-slate-400">Sin foto en la inspección anterior.</p>
            )}

            {tienePortadaNueva && (
              <>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Nueva foto seleccionada</p>
                <div className="mb-3">
                  <img
                    src={`/api/inspecciones/${id}/foto?t=${fotoVersion}`}
                    alt="Nueva foto de portada"
                    className="max-h-56 max-w-full cursor-zoom-in rounded-lg border-2 border-green-600 object-contain"
                    onClick={(e) => setFotoAmpliada((e.target as HTMLImageElement).src)}
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-2.5">
              <Button type="button" variant="outline" className="h-12" onClick={() => portadaInputRef.current?.click()} disabled={subiendoPortada}>
                {subiendoPortada ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                {tienePortadaNueva ? 'Cambiar foto' : 'Tomar foto nueva'}
              </Button>
              <Button type="button" variant="gradient" className="h-12" onClick={() => setFase(hallazgos.length > 0 ? 'revisar' : 'nuevos')}>
                {tienePortadaNueva ? 'Continuar con esta foto →' : 'Usar foto anterior / Sin foto →'}
              </Button>
            </div>

            <input
              ref={portadaInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePortadaChange}
            />
          </div>
        </div>
        {linkSalir}
      </>
    );
  }

  function renderRevisar() {
    const h = hallazgos[paso];
    const total = hallazgos.length;
    const color = CRITICIDAD_COLOR[h.criticidad] || '#1e3a5f';
    const estadoActual = h.estado_revision;
    const fotosAnt = h.fotos_anteriores || [];
    const fotosNuevas = h.fotos || [];
    const pct = Math.round((paso / total) * 100);

    return (
      <>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="mb-3 text-sm text-slate-500">
          Hallazgo {paso + 1} de {total}
        </p>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: color }}>
            <span className="text-2xl font-extrabold leading-none">#{h.numero}</span>
            <span className="text-sm font-bold uppercase tracking-wide">{CRITICIDAD_LABEL[h.criticidad] || h.criticidad}</span>
          </div>
          <div className="p-4">
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              {h.sistema && (
                <span>
                  <b>Sistema:</b> {h.sistema}
                </span>
              )}
              {h.sector && (
                <span>
                  <b>Sector:</b> {h.sector}
                </span>
              )}
            </div>
            {h.descripcion_dano && (
              <p className="mb-1 text-sm leading-relaxed text-slate-700">
                <b>Descripción:</b> {h.descripcion_dano}
              </p>
            )}
            {h.trabajo_realizar && (
              <p className="mb-1 text-sm leading-relaxed text-slate-700">
                <b>Trabajo a realizar:</b> {h.trabajo_realizar}
              </p>
            )}

            {fotosAnt.length > 0 && (
              <>
                <p className="mb-1.5 mt-3 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Referencia: inspección anterior (solo lectura)
                </p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {fotosAnt.map((f) => {
                    const src = `/api/hallazgos/${h.hallazgo_origen_id}/fotos/${f.id}/imagen`;
                    return (
                      <div key={f.id} className="relative h-[72px] w-[72px]">
                        <img
                          src={src}
                          alt="Foto de la inspección anterior (referencia, solo lectura)"
                          className="h-full w-full cursor-zoom-in rounded-md border border-slate-200 object-cover opacity-70"
                          onClick={() => setFotoAmpliada(src)}
                        />
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white shadow">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p className="mb-2 mt-4 text-base font-semibold text-slate-900">¿El daño persiste?</p>
            <div className="mb-2 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => marcarEstado('persiste')}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-lg border-2 text-sm font-bold transition-colors ${
                  estadoActual === 'persiste' ? 'border-green-700 bg-green-700 text-white' : 'border-green-700 text-green-700 hover:bg-green-700 hover:text-white'
                }`}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Sí, persiste
              </button>
              <button
                type="button"
                onClick={() => marcarEstado('resuelto')}
                className={`flex h-12 items-center justify-center gap-1.5 rounded-lg border-2 text-sm font-bold transition-colors ${
                  estadoActual === 'resuelto' ? 'border-slate-500 bg-slate-500 text-white dark:text-slate-950' : 'border-slate-400 text-slate-600 hover:bg-slate-500 hover:text-white dark:hover:text-slate-950'
                }`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Resuelto / No encontrado
              </button>
            </div>

            {estadoActual && (
              <div>
                {estadoActual === 'persiste' ? (
                  <>
                    <div className="mt-3 space-y-1.5">
                      <Label htmlFor="notaRev">Condición actual / notas</Label>
                      <Textarea id="notaRev" rows={3} placeholder="Persiste condición en…" value={nota} onChange={(e) => setNota(e.target.value)} />
                    </div>
                    <p className="mb-1.5 mt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Fotos actuales</p>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {fotosNuevas.map((f) => {
                        const src = `/api/hallazgos/${h.id}/fotos/${f.id}/imagen?t=${fotoVersion}`;
                        return (
                          <div key={f.id} className="relative h-[72px] w-[72px]">
                            <img src={src} alt="Foto actual del hallazgo" className="h-full w-full cursor-zoom-in rounded-md border border-slate-200 object-cover" onClick={() => setFotoAmpliada(src)} />
                            <button
                              type="button"
                              onClick={() => eliminarFoto(h.id, f.id)}
                              title="Quitar"
                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <Button type="button" variant="outline" className="mb-1 h-11 w-full" onClick={() => abrirCamara(h.id)} disabled={subiendoFoto}>
                      {subiendoFoto && editorHallazgoId === h.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
                      Agregar foto
                    </Button>
                  </>
                ) : (
                  <div className="mt-3 space-y-1.5">
                    <Label htmlFor="notaRev">Nota (opcional)</Label>
                    <Textarea id="notaRev" rows={2} placeholder="Observaciones sobre la resolución…" value={nota} onChange={(e) => setNota(e.target.value)} />
                  </div>
                )}

                {msgPaso && (
                  <div className="mt-2">
                    <Mensaje {...msgPaso} />
                  </div>
                )}

                <Button type="button" variant="gradient" className="mt-4 h-12 w-full" onClick={guardarYSiguiente} disabled={guardandoPaso}>
                  {guardandoPaso ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {paso < total - 1 ? 'Guardar y siguiente →' : 'Guardar y finalizar revisión →'}
                </Button>
              </div>
            )}
          </div>
        </div>
        {linkSalir}
      </>
    );
  }

  function renderNuevos() {
    const nuevos = hallazgos.filter((h) => h.estado_revision === 'nuevo');

    if (mostrarWizard) {
      return (
        <HallazgoWizardForm
          inspeccionId={id!}
          zonas={zonas}
          diagramas={diagramas}
          plantillaId={insp?.plantilla_id ?? null}
          onGuardado={manejarHallazgoGuardado}
          accionesExito={(_exito, _agregarOtro) => (
            <Button type="button" variant="outline" className="h-12 w-full" onClick={() => { setMostrarWizard(false); setFase('listo'); }}>
              Continuar / Finalizar revisión
            </Button>
          )}
        />
      );
    }

    return (
      <>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
          <div className="bg-brand px-4 py-3">
            <span className="text-sm font-bold uppercase tracking-wide text-white">Revisión completada</span>
          </div>
          <div className="p-4">
            <p className="mb-3 text-base text-slate-700">
              ¿Hay <b>nuevos hallazgos</b> para registrar?
            </p>
            {nuevos.length > 0 && <p className="mb-3 text-sm text-slate-500">{nuevos.length} nuevo(s) ya registrado(s).</p>}

            <div className="flex flex-wrap gap-2.5">
              <Button type="button" variant="gradient" className="h-12" onClick={() => setMostrarWizard(true)}>
                + Agregar hallazgo
              </Button>
              <Button type="button" variant="outline" className="h-12" onClick={() => setFase('listo')}>
                No hay nuevos — Finalizar
              </Button>
            </div>

            {nuevos.length > 0 && (
              <div className="mt-4 divide-y divide-slate-200">
                {nuevos.map((h) => (
                  <div key={h.id} className="flex items-center gap-2.5 py-2 text-sm text-slate-700">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${CRITICIDAD_BADGE[h.criticidad] || ''}`}>
                      {CRITICIDAD_LABEL[h.criticidad] || h.criticidad}
                    </span>
                    <span>
                      {h.sistema || ''}
                      {h.sector ? ` — ${h.sector}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {linkSalir}
      </>
    );
  }

  function renderListo() {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
        <div className="bg-green-700 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-white">Listo para completar</span>
        </div>
        <div className="p-4">
          <p className="mb-4 text-sm text-slate-700">Revisados {hallazgos.filter((h) => h.estado_revision).length} hallazgos.</p>
          <Button type="button" variant="gradient" className="h-12 w-full" onClick={() => setModalFirmaAbierto(true)}>
            Finalizar inspección
          </Button>
          <Button type="button" variant="outline" className="mt-2.5 h-12 w-full" onClick={() => setFase('nuevos')}>
            ← Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Revisión guiada — {insp.equipo}</h1>

      {fase === 'portada' && renderPortada()}
      {fase === 'revisar' && renderRevisar()}
      {fase === 'nuevos' && renderNuevos()}
      {fase === 'listo' && renderListo()}

      <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoChange} />

      {editorArchivo && <PhotoEditorDialog archivo={editorArchivo} titulo="Resalta el punto importante de la foto" onCancel={handleEditorCancel} onConfirm={handleEditorConfirm} />}

      {fotoAmpliada && (
        <div className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-slate-950/95 p-4" onClick={() => setFotoAmpliada(null)}>
          <img src={fotoAmpliada} alt="" className="max-h-[96vh] max-w-[96vw] rounded-lg object-contain" />
        </div>
      )}

      <FirmarInspeccionDialog
        open={modalFirmaAbierto}
        onOpenChange={setModalFirmaAbierto}
        inspeccionId={id!}
        equipo={insp.equipo}
        ot={insp.ot}
        numHallazgos={hallazgos.length}
        onFirmado={handleFirmada}
      />
    </div>
  );
}
