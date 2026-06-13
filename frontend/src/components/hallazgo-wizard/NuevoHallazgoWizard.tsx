import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, MapPin, Plus } from 'lucide-react';
import { apiFetch, apiUpload, ApiError } from '@/lib/api';
import { type Zona } from '@/components/ZonaSelector';
import { aCuerpoApi, DATOS_INICIALES, resumenUbicacion, type DatosHallazgo } from './datos';
import PasoCriticidad from './PasoCriticidad';
import PasoTipoDano from './PasoTipoDano';
import PasoUbicacion from './PasoUbicacion';
import PasoFotos from './PasoFotos';
import PasoConfirmacion from './PasoConfirmacion';

interface Inspeccion {
  id: number;
  equipo: string;
  estado: 'en_curso' | 'completada' | string;
  plantilla_id: number;
}

interface Hallazgo {
  id: number;
  numero: number;
}

interface ExitoInfo {
  hallazgoId: number;
  numero: number;
  criticidad: 'alta' | 'media' | 'baja';
  tipoDano: string;
  sistema: string;
  sector: string;
}

const ETIQUETA_CRITICIDAD: Record<string, { texto: string; clases: string }> = {
  alta: { texto: 'ALTA', clases: 'bg-red-100 text-red-600' },
  media: { texto: 'MEDIA', clases: 'bg-amber-100 text-amber-800' },
  baja: { texto: 'BAJA', clases: 'bg-green-100 text-green-600' },
};

const TITULOS = ['Criticidad', 'Tipo de daño', 'Ubicación', 'Fotos', 'Confirmar'];

export default function NuevoHallazgoWizard() {
  const { inspeccionId } = useParams<{ inspeccionId: string }>();
  const navigate = useNavigate();

  const [insp, setInsp] = useState<Inspeccion | null>(null);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [loadError, setLoadError] = useState('');
  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState<DatosHallazgo>(DATOS_INICIALES);
  const [guardando, setGuardando] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exito, setExito] = useState<ExitoInfo | null>(null);

  useEffect(() => {
    apiFetch<Inspeccion>(`/inspecciones/${inspeccionId}`)
      .then(async (i) => {
        // Catálogo de zonas técnicas de la plantilla; si falla o está vacío,
        // el paso 3 usa los catálogos genéricos como hasta ahora.
        try {
          setZonas(await apiFetch<Zona[]>(`/plantillas/${i.plantilla_id}/zonas`));
        } catch {
          setZonas([]);
        }
        setInsp(i);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
  }, [inspeccionId]);

  const actualizar = (parcial: Partial<DatosHallazgo>) => setDatos((d) => ({ ...d, ...parcial }));

  async function guardar() {
    if (!datos.criticidad) return;
    setGuardando(true);
    setSaveError('');
    try {
      const creado = await apiFetch<Hallazgo>('/hallazgos', {
        method: 'POST',
        body: JSON.stringify(aCuerpoApi(datos, Number(inspeccionId))),
      });
      for (const foto of datos.fotos) {
        const formData = new FormData();
        formData.append('foto', foto.archivo);
        await apiUpload(`/hallazgos/${creado.id}/fotos`, formData);
      }
      const tipo = datos.tipoDano === 'Otro' ? datos.tipoDanoOtro.trim() : datos.tipoDano;
      const { sistema, sector } = resumenUbicacion(datos);
      setGuardando(false);
      setExito({
        hallazgoId: creado.id,
        numero: creado.numero,
        criticidad: datos.criticidad,
        tipoDano: tipo || '',
        sistema,
        sector,
      });
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
      setGuardando(false);
    }
  }

  function agregarOtro() {
    for (const f of datos.fotos) URL.revokeObjectURL(f.preview);
    setDatos(DATOS_INICIALES);
    setPaso(1);
    setExito(null);
    setSaveError('');
  }

  if (loadError) {
    return (
      <div>
        <Link to={`/inspecciones/${inspeccionId}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a la inspección
        </Link>
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{loadError}</div>
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

  if (insp.estado !== 'en_curso') {
    return (
      <div>
        <Link to={`/inspecciones/${inspeccionId}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand dark:text-brand-cyan">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a la inspección
        </Link>
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800">
          Esta inspección ya está completada; no se pueden agregar hallazgos.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-230px)] flex-col">
      {/* Progreso */}
      {!exito && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h1 className="font-heading text-lg font-semibold text-slate-900">
              Nuevo hallazgo — {insp.equipo}
            </h1>
            <span className="shrink-0 text-sm font-medium text-slate-600">Paso {paso} de 5</span>
          </div>
          <div className="flex gap-1.5" role="progressbar" aria-valuenow={paso} aria-valuemin={1} aria-valuemax={5} aria-label={`Paso ${paso} de 5: ${TITULOS[paso - 1]}`}>
            {TITULOS.map((t, i) => (
              <div key={t} className={`h-1.5 flex-1 rounded-full ${i < paso ? 'bg-brand dark:bg-brand-cyan' : 'bg-slate-200'}`} />
            ))}
          </div>
        </div>
      )}

      {/* Pantalla de éxito */}
      {exito && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <CheckCircle2
            className="mb-4 h-20 w-20 animate-in zoom-in-50 fade-in text-green-600 duration-300"
            aria-hidden="true"
          />
          <h2 className="font-heading text-xl font-semibold text-slate-900">
            Hallazgo N°{exito.numero} guardado
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            <span className={`inline-block rounded-full px-2.5 py-0.5 font-heading font-bold ${ETIQUETA_CRITICIDAD[exito.criticidad].clases}`}>
              {ETIQUETA_CRITICIDAD[exito.criticidad].texto}
            </span>
            {exito.tipoDano ? ` · ${exito.tipoDano}` : ''}
          </p>
          {(exito.sistema || exito.sector) && (
            <p className="mt-1 text-sm text-slate-600">
              {exito.sistema}{exito.sector ? ` — ${exito.sector}` : ''}
            </p>
          )}

          <div className="mt-8 flex w-full flex-col gap-2.5">
            <button
              type="button"
              onClick={agregarOtro}
              className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              Agregar otro hallazgo
            </button>
            <button
              type="button"
              onClick={() => navigate(`/inspecciones/${inspeccionId}/hallazgos/${exito.hallazgoId}?marcar=1`)}
              className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-slate-200 font-heading text-base font-medium text-slate-700 transition-colors hover:border-slate-300"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
              Marcar en diagrama
            </button>
            <button
              type="button"
              onClick={() => navigate(`/inspecciones/${inspeccionId}`)}
              className="mt-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              Volver a la inspección
            </button>
          </div>
        </div>
      )}

      {/* Paso actual */}
      {!exito && paso === 1 && (
        <PasoCriticidad
          seleccionada={datos.criticidad}
          onSeleccionar={(c) => {
            actualizar({ criticidad: c });
            setPaso(2);
          }}
        />
      )}
      {!exito && paso === 2 && (
        <PasoTipoDano
          seleccionado={datos.tipoDano}
          otro={datos.tipoDanoOtro}
          onSeleccionar={(tipo) => {
            actualizar({ tipoDano: tipo });
            if (tipo !== 'Otro') setPaso(3);
          }}
          onCambiarOtro={(texto) => actualizar({ tipoDanoOtro: texto })}
          onContinuarOtro={() => setPaso(3)}
        />
      )}
      {!exito && paso === 3 && <PasoUbicacion datos={datos} actualizar={actualizar} onContinuar={() => setPaso(4)} zonas={zonas} />}
      {!exito && paso === 4 && <PasoFotos datos={datos} actualizar={actualizar} onContinuar={() => setPaso(5)} />}
      {!exito && paso === 5 && <PasoConfirmacion datos={datos} guardando={guardando} error={saveError} onGuardar={guardar} />}

      {/* Anterior: pequeño y discreto */}
      {!exito && (
        <div className="mt-4 flex justify-between text-sm">
          {paso > 1 ? (
            <button
              type="button"
              onClick={() => setPaso(paso - 1)}
              className="inline-flex cursor-pointer items-center gap-1 font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Anterior
            </button>
          ) : (
            <Link
              to={`/inspecciones/${inspeccionId}`}
              className="inline-flex items-center gap-1 font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Cancelar
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
