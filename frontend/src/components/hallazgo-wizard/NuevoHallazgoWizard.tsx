import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { apiFetch, apiUpload, ApiError } from '@/lib/api';
import { type Zona } from '@/components/ZonaSelector';
import { aCuerpoApi, DATOS_INICIALES, type DatosHallazgo } from './datos';
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
}

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
      navigate(`/inspecciones/${inspeccionId}/hallazgos/${creado.id}`);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor');
      setGuardando(false);
    }
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

      {/* Paso actual */}
      {paso === 1 && (
        <PasoCriticidad
          seleccionada={datos.criticidad}
          onSeleccionar={(c) => {
            actualizar({ criticidad: c });
            setPaso(2);
          }}
        />
      )}
      {paso === 2 && (
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
      {paso === 3 && <PasoUbicacion datos={datos} actualizar={actualizar} onContinuar={() => setPaso(4)} zonas={zonas} />}
      {paso === 4 && <PasoFotos datos={datos} actualizar={actualizar} onContinuar={() => setPaso(5)} />}
      {paso === 5 && <PasoConfirmacion datos={datos} guardando={guardando} error={saveError} onGuardar={guardar} />}

      {/* Anterior: pequeño y discreto */}
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
    </div>
  );
}
