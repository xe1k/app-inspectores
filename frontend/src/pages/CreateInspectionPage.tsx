import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Loader2, MapPin } from 'lucide-react';
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
import { apiFetch, ApiError } from '@/lib/api';
import { fechaHoraLarga, fechaLocalChile } from '@/lib/fechas';

interface Plantilla {
  id: number;
  modelo: string;
  tipo: string | null;
}

interface EquipoResumen {
  equipo_norm: string;
  equipo_display: string;
  modelo: string;
  tipo: string | null;
}

const EQUIPO_NUEVO = '__nuevo__';

interface InspeccionCreada {
  id: number;
}

interface Coordenadas {
  latitud: number;
  longitud: number;
  precision_gps: number;
}

type EstadoGps =
  | { fase: 'obteniendo' }
  | { fase: 'ok'; coords: Coordenadas }
  | { fase: 'sin_permiso'; mensaje: string }
  | { fase: 'error'; mensaje: string };

// Reintentos del GPS: 1° alta precisión (8 s); si falla por algo distinto a
// permiso denegado, 2° baja precisión (5 s); si vuelve a fallar, "Sin GPS".
// Nada de esto bloquea el formulario.
function capturarGps(actualizar: (e: EstadoGps) => void) {
  if (!('geolocation' in navigator)) {
    actualizar({ fase: 'error', mensaje: 'Este dispositivo no soporta geolocalización. Continuando sin GPS.' });
    return;
  }

  const exito = (pos: GeolocationPosition) =>
    actualizar({
      fase: 'ok',
      coords: {
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        precision_gps: Math.round(pos.coords.accuracy),
      },
    });

  const mensajeError = (err: GeolocationPositionError) => {
    if (err.code === err.POSITION_UNAVAILABLE) return 'No se pudo obtener ubicación. Verifica que el GPS esté activado.';
    if (err.code === err.TIMEOUT) return 'Tiempo de espera agotado. Continuando sin GPS.';
    return 'Error al obtener ubicación. Continuando sin GPS.';
  };

  navigator.geolocation.getCurrentPosition(
    exito,
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        actualizar({ fase: 'sin_permiso', mensaje: 'Permiso de ubicación denegado. La inspección se guardará sin coordenadas GPS.' });
        return;
      }
      // Segundo intento: más rápido y con menos precisión
      navigator.geolocation.getCurrentPosition(
        exito,
        (err2) => actualizar({ fase: 'error', mensaje: mensajeError(err2) }),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function IndicadorGps({ estado }: { estado: EstadoGps }) {
  if (estado.fase === 'obteniendo') {
    return (
      <p className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Obteniendo ubicación…
      </p>
    );
  }
  if (estado.fase === 'ok') {
    return (
      <p className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700" role="status">
        <MapPin className="h-4 w-4" aria-hidden="true" />
        Ubicación obtenida ✓ <span className="font-normal">±{estado.coords.precision_gps}m</span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {estado.mensaje}
    </p>
  );
}

export default function CreateInspectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [equipos, setEquipos] = useState<EquipoResumen[] | null>(null);
  const [plantillaId, setPlantillaId] = useState('');
  const [equipoNorm, setEquipoNorm] = useState('');
  const [equipoNuevo, setEquipoNuevo] = useState('');
  const [ot, setOt] = useState('');
  const [horometro, setHorometro] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [gps, setGps] = useState<EstadoGps>({ fase: 'obteniendo' });

  // Timestamp de inicio: se registra al montar y el inspector no lo edita.
  const fechaInicio = useRef(new Date().toISOString());
  const precargado = useRef(false);

  useEffect(() => {
    apiFetch<Plantilla[]>('/plantillas')
      .then(setPlantillas)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error de conexión con el servidor'));
    apiFetch<EquipoResumen[]>('/equipos')
      .then(setEquipos)
      .catch(() => setEquipos([]));
    capturarGps(setGps);
  }, []);

  // Precarga desde la vista de equipo (?equipo=<equipo_norm>): selecciona el
  // equipo existente y el modelo de plantilla que le corresponde.
  useEffect(() => {
    if (precargado.current || !plantillas || !equipos) return;
    const norm = searchParams.get('equipo');
    if (!norm) return;
    const grupo = equipos.find((e) => e.equipo_norm === norm);
    if (!grupo) return;
    precargado.current = true;
    const plantilla = plantillas.find((p) => p.modelo === grupo.modelo);
    if (plantilla) setPlantillaId(String(plantilla.id));
    setEquipoNorm(grupo.equipo_norm);
  }, [plantillas, equipos, searchParams]);

  const plantillaSeleccionada = plantillas?.find((p) => String(p.id) === plantillaId);
  const equiposFiltrados = (equipos && plantillaSeleccionada)
    ? equipos.filter((e) => e.modelo === plantillaSeleccionada.modelo)
    : [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!plantillaId) {
      setError('Selecciona el modelo de equipo');
      return;
    }

    let equipo: string;
    if (equipoNorm === EQUIPO_NUEVO) {
      equipo = equipoNuevo.trim();
      if (!equipo) {
        setError('Escribe el nombre del equipo nuevo');
        return;
      }
    } else {
      const grupo = equiposFiltrados.find((e) => e.equipo_norm === equipoNorm);
      if (!grupo) {
        setError('Selecciona un equipo');
        return;
      }
      equipo = grupo.equipo_display;
    }

    setSubmitting(true);
    try {
      const coords = gps.fase === 'ok' ? gps.coords : null;
      const creada = await apiFetch<InspeccionCreada>('/inspecciones', {
        method: 'POST',
        body: JSON.stringify({
          plantilla_id: Number(plantillaId),
          equipo,
          ot: ot.trim(),
          fecha: fechaLocalChile(),
          horometro: horometro.trim(),
          fecha_inicio: fechaInicio.current,
          latitud: coords?.latitud ?? null,
          longitud: coords?.longitud ?? null,
          precision_gps: coords?.precision_gps ?? null,
          ubicacion_nombre: coords ? null : 'Sin GPS',
        }),
      });
      navigate(`/inspecciones/${creada.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
    } finally {
      setSubmitting(false);
    }
  };

  const sinPlantillas = plantillas !== null && plantillas.length === 0;

  return (
    <div>
      <h1 className="mb-3 font-heading text-xl font-semibold text-slate-900">Nueva inspección</h1>

      {!plantillas && !error && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-7 w-7 animate-spin text-brand dark:text-brand-cyan" aria-hidden="true" />
        </div>
      )}

      {plantillas && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-card p-5 shadow-sm"
        >
          <IndicadorGps estado={gps} />

          <div className="space-y-1.5">
            <Label htmlFor="plantilla">Modelo de equipo</Label>
            <Select
              value={plantillaId}
              onValueChange={(v) => {
                setPlantillaId(v);
                setEquipoNorm('');
                setEquipoNuevo('');
              }}
              disabled={sinPlantillas}
            >
              <SelectTrigger id="plantilla" className="h-11 bg-card">
                <SelectValue placeholder="Selecciona un modelo…" />
              </SelectTrigger>
              <SelectContent>
                {plantillas.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.modelo}
                    {p.tipo ? ` — ${p.tipo}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-slate-500">
              ¿No aparece el modelo?{' '}
              <Link to="/plantillas/nueva" className="text-brand dark:text-brand-cyan underline">
                Crea una plantilla nueva
              </Link>
              .
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="equipo">Equipo</Label>
            <Select
              value={equipoNorm}
              onValueChange={(v) => {
                setEquipoNorm(v);
                if (v !== EQUIPO_NUEVO) setEquipoNuevo('');
              }}
              disabled={!plantillaId}
            >
              <SelectTrigger id="equipo" className="h-11 bg-card">
                <SelectValue placeholder={plantillaId ? 'Selecciona un equipo…' : 'Primero elige el modelo'} />
              </SelectTrigger>
              <SelectContent>
                {equiposFiltrados.map((eq) => (
                  <SelectItem key={eq.equipo_norm} value={eq.equipo_norm}>
                    {eq.equipo_display}
                  </SelectItem>
                ))}
                <SelectItem value={EQUIPO_NUEVO}>+ Nuevo equipo</SelectItem>
              </SelectContent>
            </Select>
            {equipoNorm === EQUIPO_NUEVO && (
              <Input
                autoFocus
                required
                placeholder="ej. CAEX-203"
                className="mt-1.5 h-11 bg-card"
                value={equipoNuevo}
                onChange={(e) => setEquipoNuevo(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ot">OT (orden de trabajo)</Label>
            <Input
              id="ot"
              placeholder="ej. 4863982"
              className="h-11 bg-card"
              value={ot}
              onChange={(e) => setOt(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-slate-100 px-3 py-2.5">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
              Fecha registrada automáticamente al crear
            </p>
            <p className="mt-0.5 pl-6 text-sm text-slate-500">{fechaHoraLarga(fechaInicio.current)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="horometro">Horómetro</Label>
            <Input
              id="horometro"
              inputMode="numeric"
              placeholder="ej. 30397"
              className="h-11 bg-card"
              value={horometro}
              onChange={(e) => setHorometro(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          {sinPlantillas && !error && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
              Primero debes crear al menos una plantilla de equipo.
            </div>
          )}

          <Button
            type="submit"
            variant="gradient"
            disabled={submitting || sinPlantillas}
            className="h-12 w-full text-base"
          >
            {submitting ? 'Creando...' : 'Iniciar inspección'}
          </Button>
        </form>
      )}
    </div>
  );
}
