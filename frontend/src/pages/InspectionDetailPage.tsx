import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { infoEstado } from '@/components/EstadoHallazgo';
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Download,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { duracionEntre, fechaHoraCorta } from '@/lib/fechas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, apiUpload, ApiError } from '@/lib/api';
import { compressImage } from '@/lib/compressImage';
import { useToast } from '@/components/Toast';
import FirmarInspeccionDialog from '@/components/FirmarInspeccionDialog';
import ReabrirInspeccionDialog from '@/components/ReabrirInspeccionDialog';

interface Hallazgo {
  id: number;
  numero: number;
  sistema: string | null;
  sector: string | null;
  codigo: string | null;
  criticidad: 'alta' | 'media' | 'baja' | string;
  preexistencia: 'si' | 'no' | 'na' | string;
  estado: string | null;
  creado_en: string;
}

// Orden de la lista: criticidad Alta primero; a igual criticidad, los menos
// avanzados del ciclo de vida arriba (detectado primero, verificado al final).
const ORDEN_CRITICIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const ORDEN_ESTADO: Record<string, number> = { detectado: 0, en_reparacion: 1, resuelto: 2, verificado: 3 };
function ordenarHallazgos(hs: Hallazgo[]) {
  return [...hs].sort(
    (a, b) =>
      (ORDEN_CRITICIDAD[a.criticidad] ?? 9) - (ORDEN_CRITICIDAD[b.criticidad] ?? 9) ||
      (ORDEN_ESTADO[a.estado || 'detectado'] ?? 9) - (ORDEN_ESTADO[b.estado || 'detectado'] ?? 9) ||
      a.numero - b.numero
  );
}

export interface Inspeccion {
  id: number;
  equipo: string;
  ot: string | null;
  fecha: string;
  horometro: string | number | null;
  estado: 'en_curso' | 'completada' | string;
  plantilla_modelo: string;
  plantilla_tipo: string | null;
  foto_portada: string | null;
  inspeccion_base_id: number | null;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  latitud: number | null;
  longitud: number | null;
  precision_gps: number | null;
  ubicacion_nombre: string | null;
  firmada: number;
  firma_nombre: string | null;
  firma_timestamp: string | null;
  firma_hash: string | null;
  hallazgos: Hallazgo[];
}

const ETIQUETAS_CRITICIDAD: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
const ETIQUETAS_PREEXISTENCIA: Record<string, string> = { si: 'Sí', no: 'No', na: 'N/A' };

const ESTILOS_CRITICIDAD: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-green-100 text-green-700',
};

function formatoFecha(f: string | null) {
  if (!f) return '—';
  return f.slice(0, 10).split('-').reverse().join('-');
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

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [insp, setInsp] = useState<Inspeccion | null>(null);
  const [loadError, setLoadError] = useState('');

  const [editandoDatos, setEditandoDatos] = useState(false);
  const [formEquipo, setFormEquipo] = useState('');
  const [formOt, setFormOt] = useState('');
  const [formFecha, setFormFecha] = useState('');
  const [formHorometro, setFormHorometro] = useState('');
  const [guardandoCabecera, setGuardandoCabecera] = useState(false);

  const [msg, setMsg] = useState<MensajeProps | null>(null);
  const [msgPortada, setMsgPortada] = useState<MensajeProps | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoVersion, setFotoVersion] = useState(0);

  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [verRegistro, setVerRegistro] = useState(false);
  const [accionando, setAccionando] = useState(false);

  const [modalRevisionAbierto, setModalRevisionAbierto] = useState(false);
  const [revFecha, setRevFecha] = useState('');
  const [revOt, setRevOt] = useState('');
  const [revHorometro, setRevHorometro] = useState('');
  const [msgRevision, setMsgRevision] = useState('');
  const [creandoRevision, setCreandoRevision] = useState(false);

  const [modalFirmaAbierto, setModalFirmaAbierto] = useState(false);
  const [modalReabrirAbierto, setModalReabrirAbierto] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargar() {
    try {
      const data = await apiFetch<Inspeccion>(`/inspecciones/${id}`);
      setInsp(data);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
    }
  }

  function iniciarEdicion() {
    if (!insp) return;
    setFormEquipo(insp.equipo);
    setFormOt(insp.ot || '');
    setFormFecha((insp.fecha || '').slice(0, 10));
    setFormHorometro(insp.horometro != null ? String(insp.horometro) : '');
    setEditandoDatos(true);
  }

  async function guardarCabecera(e: FormEvent) {
    e.preventDefault();
    setGuardandoCabecera(true);
    setMsg(null);
    try {
      const data = await apiFetch<Inspeccion>(`/inspecciones/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          equipo: formEquipo.trim(),
          ot: formOt.trim(),
          fecha: formFecha,
          horometro: formHorometro.trim(),
        }),
      });
      setInsp(data);
      setEditandoDatos(false);
      setMsg({ tipo: 'ok', texto: 'Datos guardados' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setGuardandoCabecera(false);
    }
  }

  async function subirFoto(file: File) {
    setSubiendoFoto(true);
    setMsgPortada({ tipo: 'ok', texto: 'Procesando foto…' });
    try {
      const comprimida = await compressImage(file);
      const formData = new FormData();
      formData.append('foto', comprimida);
      setMsgPortada({ tipo: 'ok', texto: 'Subiendo foto…' });
      await apiUpload(`/inspecciones/${id}/foto`, formData);
      const data = await apiFetch<Inspeccion>(`/inspecciones/${id}`);
      setInsp(data);
      setFotoVersion((v) => v + 1);
      setMsgPortada({ tipo: 'ok', texto: 'Foto de portada guardada' });
    } catch (e) {
      setMsgPortada({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setSubiendoFoto(false);
    }
  }

  function handleArchivoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) subirFoto(archivo);
  }

  async function quitarPortada() {
    if (!confirm('¿Quitar la foto de portada?')) return;
    setMsgPortada(null);
    try {
      await apiFetch(`/inspecciones/${id}/foto`, { method: 'DELETE' });
      const data = await apiFetch<Inspeccion>(`/inspecciones/${id}`);
      setInsp(data);
      setMsgPortada({ tipo: 'ok', texto: 'Foto de portada eliminada' });
    } catch (e) {
      setMsgPortada({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  async function reabrirInspeccion() {
    if (!confirm('¿Reabrir esta inspección para corregirla? Podrás volver a finalizarla cuando termines.')) return;
    setAccionando(true);
    setMsg(null);
    try {
      const data = await apiFetch<Inspeccion>(`/inspecciones/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado: 'en_curso' }),
      });
      setInsp(data);
      setMsg({ tipo: 'ok', texto: 'Inspección reabierta. Ya puedes editar y agregar hallazgos.' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    } finally {
      setAccionando(false);
    }
  }

  function handleFirmada(data: Inspeccion) {
    setInsp(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMsg({ tipo: 'ok', texto: 'Inspección firmada y completada ✓ Ya puedes descargar el informe en PDF.' });
  }

  function handleReabierta(data: Inspeccion) {
    setInsp(data);
    setMsg({ tipo: 'ok', texto: 'Inspección reabierta. Ya puedes editar y agregar hallazgos.' });
  }

  function abrirReabrir() {
    if (insp?.firmada) {
      setModalReabrirAbierto(true);
    } else {
      reabrirInspeccion();
    }
  }

  async function verificarFirma() {
    setVerificando(true);
    try {
      const r = await apiFetch<{ valida: boolean }>(`/inspecciones/${id}/verificar-firma`);
      showToast(r.valida ? 'La firma es válida: el contenido no ha sido modificado.' : 'La firma NO es válida: el contenido fue modificado después de firmar.', r.valida ? 'ok' : 'error');
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Error de conexión con el servidor', 'error');
    } finally {
      setVerificando(false);
    }
  }

  async function generarInforme() {
    if (!insp) return;
    setGenerandoInforme(true);
    setMsg({ tipo: 'ok', texto: 'Generando el PDF del informe, puede tardar unos segundos…' });
    try {
      const r = await fetch(`/api/inspecciones/${id}/informe`, { credentials: 'include' });
      if (!r.ok) {
        let texto = 'Ocurrió un error';
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
      a.download = `Informe_${insp.equipo}_${insp.fecha}`.replace(/[^\w.-]+/g, '_') + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({ tipo: 'ok', texto: 'Informe descargado correctamente.' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'Ocurrió un error' });
    } finally {
      setGenerandoInforme(false);
    }
  }

  function abrirModalRevision() {
    setRevFecha(new Date().toLocaleDateString('sv-SE'));
    setRevOt('');
    setRevHorometro('');
    setMsgRevision('');
    setModalRevisionAbierto(true);
  }

  async function confirmarRevision() {
    if (!revFecha) {
      setMsgRevision('La fecha es obligatoria');
      return;
    }
    setCreandoRevision(true);
    setMsgRevision('Creando revisión…');
    try {
      const res = await apiFetch<{ inspeccion_id: number }>(`/inspecciones/${id}/nueva-revision`, {
        method: 'POST',
        body: JSON.stringify({ fecha: revFecha, ot: revOt.trim(), horometro: revHorometro.trim() }),
      });
      setModalRevisionAbierto(false);
      navigate(`/inspecciones/${res.inspeccion_id}/revision`);
    } catch (e) {
      setMsgRevision(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
      setCreandoRevision(false);
    }
  }

  async function eliminarInspeccion() {
    if (!insp) return;
    if (!confirm(`¿Eliminar la inspección de "${insp.equipo}" y todos sus hallazgos? Esta acción no se puede deshacer.`)) return;
    setMsg(null);
    try {
      await apiFetch(`/inspecciones/${id}`, { method: 'DELETE' });
      navigate('/');
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'Error de conexión con el servidor' });
    }
  }

  if (loadError) {
    return (
      <div>
        <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </Link>
        <div className="rounded-lg bg-red-50 px-4 py-6 text-center text-red-700" role="alert">
          <div className="font-semibold">No se pudo cargar la inspección</div>
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

  const completada = insp.estado === 'completada';
  const numHallazgos = insp.hallazgos.length;

  const resumen = (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700">
      <span><b className="text-slate-900">Equipo:</b> {insp.equipo}</span>
      <span><b className="text-slate-900">OT:</b> {insp.ot || '—'}</span>
      <span><b className="text-slate-900">Fecha:</b> {formatoFecha(insp.fecha)}</span>
      <span><b className="text-slate-900">Horómetro:</b> {insp.horometro ?? '—'}</span>
      <span>
        <b className="text-slate-900">Modelo:</b> {insp.plantilla_modelo}
        {insp.plantilla_tipo ? ` (${insp.plantilla_tipo})` : ''}
      </span>
    </div>
  );

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </Link>

      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">
        {insp.equipo} · {insp.plantilla_modelo}
      </h1>

      {insp.inspeccion_base_id && insp.estado === 'en_curso' && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <p className="mb-1 font-semibold text-slate-900">Esta inspección es una revisión guiada.</p>
          <p className="mb-3 text-sm text-slate-500">
            Tu avance queda guardado automáticamente. Puedes continuarla donde la dejaste:
          </p>
          <Link
            to={`/inspecciones/${id}/revision`}
            className="flex h-11 w-full items-center justify-center rounded-full bg-brand font-heading text-sm font-medium text-white transition-colors hover:bg-brand-teal"
          >
            Continuar revisión guiada →
          </Link>
        </div>
      )}

      {/* Cabecera */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
        {completada ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block whitespace-nowrap rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
                Completada
              </span>
              {insp.firmada === 1 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand dark:text-brand-cyan">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Firmada
                </span>
              )}
            </div>
            {resumen}
            {insp.firmada === 1 && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-secondary p-3 text-sm text-slate-700">
                <p>
                  Firmada por <b className="text-slate-900">{insp.firma_nombre || '—'}</b> el{' '}
                  {fechaHoraCorta(insp.firma_timestamp) || '—'}
                </p>
                {insp.firma_hash && (
                  <p className="mt-0.5 text-slate-500">Código: {insp.firma_hash.slice(0, 12)}</p>
                )}
                <Button variant="outline" size="sm" className="mt-2" onClick={verificarFirma} disabled={verificando}>
                  {verificando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  Verificar integridad
                </Button>
              </div>
            )}
            <Button
              variant="gradient"
              className="mt-4 h-12 w-full text-base"
              onClick={generarInforme}
              disabled={generandoInforme}
            >
              {generandoInforme ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {generandoInforme ? 'Generando informe…' : 'Descargar informe (PDF)'}
            </Button>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={abrirModalRevision} disabled={accionando}>
                Nueva revisión guiada
              </Button>
              <Button variant="outline" size="sm" onClick={abrirReabrir} disabled={accionando}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reabrir para corregir
              </Button>
            </div>
          </>
        ) : !editandoDatos ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-block whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                En curso
              </span>
              <Button variant="outline" size="sm" onClick={iniciarEdicion}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Editar datos
              </Button>
            </div>
            {resumen}
          </>
        ) : (
          <form onSubmit={guardarCabecera} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="campoEquipo">Equipo</Label>
                <Input id="campoEquipo" className="h-11 bg-card" value={formEquipo} onChange={(e) => setFormEquipo(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campoOt">OT</Label>
                <Input id="campoOt" className="h-11 bg-card" value={formOt} onChange={(e) => setFormOt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campoFecha">Fecha</Label>
                <Input id="campoFecha" type="date" className="h-11 bg-card" value={formFecha} onChange={(e) => setFormFecha(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campoHorometro">Horómetro</Label>
                <Input id="campoHorometro" inputMode="numeric" className="h-11 bg-card" value={formHorometro} onChange={(e) => setFormHorometro(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="gradient" disabled={guardandoCabecera}>
                {guardandoCabecera ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditandoDatos(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </div>

      {msg && <div className="mb-3">{<Mensaje {...msg} />}</div>}

      {/* Foto de portada */}
      <div className="mb-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
        <h2 className="font-heading text-base font-semibold text-slate-900">Foto del equipo</h2>
        <p className="-mt-0.5 mb-2 text-sm text-slate-500">Aparecerá como portada del informe.</p>

        {insp.foto_portada ? (
          <>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <img
                src={`/api/inspecciones/${id}/foto?t=${fotoVersion}`}
                alt="Foto de portada"
                className="aspect-video w-full max-w-sm object-cover"
              />
            </div>
            {!completada && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={subiendoFoto}>
                  Cambiar foto
                </Button>
                <Button variant="outline" size="sm" onClick={quitarPortada} disabled={subiendoFoto}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Quitar foto
                </Button>
              </div>
            )}
          </>
        ) : completada ? (
          <p className="text-sm text-slate-400">Esta inspección no tiene foto de portada.</p>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendoFoto}
            className="flex aspect-video w-full max-w-sm cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-brand hover:text-brand"
          >
            {subiendoFoto ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Camera className="h-6 w-6" aria-hidden="true" />}
            Agregar foto del equipo
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleArchivoChange}
        />

        {msgPortada && <div className="mt-2.5"><Mensaje {...msgPortada} /></div>}
      </div>

      {/* Datos de registro automático (solo lectura, para auditoría) */}
      <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setVerRegistro(!verRegistro)}
          aria-expanded={verRegistro}
          className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left transition-colors hover:bg-secondary"
        >
          <span className="font-heading text-base font-semibold text-slate-900">Datos de registro</span>
          <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${verRegistro ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {verRegistro && (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-700">
            <p>
              <b className="text-slate-900">Inicio de inspección:</b>{' '}
              {fechaHoraCorta(insp.fecha_inicio) || `${formatoFecha(insp.fecha)} (sin hora — registro antiguo)`}
            </p>
            <p className="mt-1">
              <b className="text-slate-900">Cierre de inspección:</b> {fechaHoraCorta(insp.fecha_cierre) || '—'}
            </p>
            {duracionEntre(insp.fecha_inicio, insp.fecha_cierre) && (
              <p className="mt-1">
                <b className="text-slate-900">Duración:</b> {duracionEntre(insp.fecha_inicio, insp.fecha_cierre)}
              </p>
            )}
            <p className="mt-3 font-semibold text-slate-900">Ubicación GPS:</p>
            {insp.latitud != null && insp.longitud != null ? (
              <>
                <p className="mt-0.5">
                  Latitud: {insp.latitud.toFixed(4)} · Longitud: {insp.longitud.toFixed(4)}
                  {insp.precision_gps != null ? ` · Precisión: ±${Math.round(insp.precision_gps)}m` : ''}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${insp.latitud},${insp.longitud}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 font-medium text-brand underline-offset-2 hover:underline dark:text-brand-cyan"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  Ver en mapa
                </a>
              </>
            ) : (
              <p className="mt-0.5 text-slate-500">Ubicación no disponible</p>
            )}
          </div>
        )}
      </div>

      {/* Hallazgos */}
      <h2 className="mb-2 mt-5 font-heading text-base font-semibold text-slate-900">
        {numHallazgos ? `Hallazgos (${numHallazgos})` : 'Hallazgos'}
      </h2>

      <div className="flex flex-col gap-2.5">
        {numHallazgos === 0 && (
          <div className="rounded-lg px-4 py-8 text-center text-slate-400">
            <div className="mb-1 font-semibold text-slate-600">Todavía no hay hallazgos registrados</div>
            {completada
              ? 'Esta inspección no tiene registros.'
              : 'Toca el botón "+ Agregar hallazgo" para registrar el primer daño encontrado.'}
          </div>
        )}

        {ordenarHallazgos(insp.hallazgos).map((h) => (
          <Link
            key={h.id}
            to={`/inspecciones/${id}/hallazgos/${h.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-card p-4 shadow-sm transition-colors hover:border-brand"
          >
            <div>
              <div className="font-bold text-slate-900">
                N°{h.numero} · {h.sistema || 'Sin sistema'}{h.sector ? ` — ${h.sector}` : ''}
              </div>
              <div className="mt-0.5 text-sm text-slate-500">
                {h.codigo ? `Código ${h.codigo} · ` : ''}Preexistencia: {ETIQUETAS_PREEXISTENCIA[h.preexistencia] ?? '—'}
              </div>
            </div>
            <span className="flex flex-col items-end gap-1">
              <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${ESTILOS_CRITICIDAD[h.criticidad] || 'bg-slate-100 text-slate-700'}`}>
                {ETIQUETAS_CRITICIDAD[h.criticidad] || h.criticidad}
              </span>
              <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${infoEstado(h.estado).pill}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${infoEstado(h.estado).punto}`} aria-hidden="true" />
                {infoEstado(h.estado).etiqueta}
              </span>
            </span>
          </Link>
        ))}
      </div>

      {!completada && (
        <Link
          to={`/inspecciones/${id}/hallazgos/nuevo`}
          className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          Agregar hallazgo
        </Link>
      )}

      {/* Finalizar */}
      {!completada && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-slate-900">¿Terminaste la inspección?</h2>
          <p className="mb-3 mt-1 text-sm text-slate-500">
            {numHallazgos > 0
              ? 'Al finalizar podrás descargar el informe en PDF. Si después necesitas corregir algo, puedes reabrirla.'
              : 'Agrega al menos un hallazgo para poder finalizar.'}
          </p>
          <Button variant="gradient" className="h-12 w-full text-base" onClick={() => setModalFirmaAbierto(true)} disabled={numHallazgos === 0 || accionando}>
            Finalizar inspección
          </Button>
        </div>
      )}

      {/* Eliminar */}
      <div className="mt-6 border-t border-slate-200 pt-4 text-center">
        <button type="button" onClick={eliminarInspeccion} className="text-sm font-medium text-red-600 hover:underline">
          Eliminar esta inspección…
        </button>
      </div>

      {/* Modal nueva revisión */}
      <Dialog open={modalRevisionAbierto} onOpenChange={setModalRevisionAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-slate-900">Nueva revisión guiada</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-sm text-slate-500">
            Se creará una nueva inspección con los hallazgos anteriores. Vas a revisarlos uno por uno.
          </p>
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="revFecha">Fecha de la revisión</Label>
              <Input id="revFecha" type="date" className="h-11 bg-card" value={revFecha} onChange={(e) => setRevFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revOt">OT (opcional)</Label>
              <Input id="revOt" placeholder="Número de orden de trabajo" className="h-11 bg-card" value={revOt} onChange={(e) => setRevOt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="revHorometro">Horómetro (opcional)</Label>
              <Input id="revHorometro" inputMode="numeric" className="h-11 bg-card" value={revHorometro} onChange={(e) => setRevHorometro(e.target.value)} />
            </div>
          </div>
          {msgRevision && <Mensaje tipo={msgRevision.startsWith('Creando') ? 'ok' : 'error'} texto={msgRevision} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRevisionAbierto(false)} disabled={creandoRevision}>
              Cancelar
            </Button>
            <Button variant="gradient" onClick={confirmarRevision} disabled={creandoRevision}>
              Iniciar revisión →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Firmar y completar */}
      <FirmarInspeccionDialog
        open={modalFirmaAbierto}
        onOpenChange={setModalFirmaAbierto}
        inspeccionId={id!}
        equipo={insp.equipo}
        ot={insp.ot}
        numHallazgos={numHallazgos}
        onFirmado={handleFirmada}
      />

      {/* Reabrir inspección firmada */}
      <ReabrirInspeccionDialog
        open={modalReabrirAbierto}
        onOpenChange={setModalReabrirAbierto}
        inspeccionId={id!}
        onReabierta={handleReabierta}
      />
    </div>
  );
}
