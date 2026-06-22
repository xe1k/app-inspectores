import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api';
import { type Zona } from '@/components/ZonaSelector';
import { type Diagrama } from '@/components/DiagramaMarcador';
import HallazgoWizardForm from './HallazgoWizardForm';

interface Inspeccion {
  id: number;
  equipo: string;
  estado: 'en_curso' | 'completada' | string;
  plantilla_id: number;
}

interface PlantillaDetalle {
  id: number;
  diagramas: Diagrama[];
}

export default function NuevoHallazgoWizard() {
  const { inspeccionId } = useParams<{ inspeccionId: string }>();
  const navigate = useNavigate();

  const [insp, setInsp] = useState<Inspeccion | null>(null);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [diagramas, setDiagramas] = useState<Diagrama[]>([]);
  const [loadError, setLoadError] = useState('');

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
        try {
          const plant = await apiFetch<PlantillaDetalle>(`/plantillas/${i.plantilla_id}`);
          setDiagramas(plant.diagramas || []);
        } catch {
          setDiagramas([]);
        }
        setInsp(i);
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
  }, [inspeccionId]);

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
    <HallazgoWizardForm
      inspeccionId={inspeccionId!}
      zonas={zonas}
      diagramas={diagramas}
      plantillaId={insp.plantilla_id}
      titulo={`Nuevo hallazgo — ${insp.equipo}`}
      cancelar={
        <Link
          to={`/inspecciones/${inspeccionId}`}
          className="inline-flex items-center gap-1 font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Cancelar
        </Link>
      }
      accionesExito={(exito) => (
        <>
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
        </>
      )}
    />
  );
}
