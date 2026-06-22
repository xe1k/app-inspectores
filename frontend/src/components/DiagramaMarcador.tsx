import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type Zona } from './ZonaSelector';

// Diagrama de referencia de una plantilla (tabla `plantilla_diagramas`)
export interface Diagrama {
  id: number;
  nombre: string;
  archivo: string;
  orden: number;
}

// Una marca sobre un diagrama. `id` solo existe si ya está persistida
// (hallazgo ya creado); las marcas pendientes del wizard no lo tienen.
export interface MarcaPosicion {
  id?: number;
  diagrama_id: number;
  x_pct: number;
  y_pct: number;
}

interface Props {
  plantillaId: number;
  diagramas: Diagrama[];
  diagramaActivo: number | null;
  onSeleccionarDiagrama: (id: number) => void;
  marcas: MarcaPosicion[];
  onAgregarMarca: (x_pct: number, y_pct: number) => void;
  onEliminarMarca?: (marca: MarcaPosicion) => void;
  /** Zona elegida en el paso de ubicación, si tiene coordenadas en este diagrama: solo orienta, no es una marca. */
  zonaConCoordenadas?: Zona | null;
  /** Contenido mostrado dentro de cada marca (p. ej. el N° del hallazgo). */
  etiquetaMarca?: ReactNode;
  readOnly?: boolean;
  ayuda?: ReactNode;
  className?: string;
}

export default function DiagramaMarcador({
  plantillaId,
  diagramas,
  diagramaActivo,
  onSeleccionarDiagrama,
  marcas,
  onAgregarMarca,
  onEliminarMarca,
  zonaConCoordenadas,
  etiquetaMarca,
  readOnly,
  ayuda,
  className,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);

  const diagramaSeleccionado = diagramas.find((d) => d.id === diagramaActivo) || null;
  const marcasDelDiagrama = marcas.filter((m) => m.diagrama_id === diagramaActivo);

  function handleLienzoClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const img = imgRef.current;
    if (!img || e.target !== img) return;
    const rect = img.getBoundingClientRect();
    const x_pct = ((e.clientX - rect.left) / rect.width) * 100;
    const y_pct = ((e.clientY - rect.top) / rect.height) * 100;
    if (x_pct < 0 || x_pct > 100 || y_pct < 0 || y_pct > 100) return;
    onAgregarMarca(x_pct, y_pct);
  }

  if (diagramas.length === 0) {
    return (
      <p className={`text-sm text-slate-400 ${className || ''}`}>
        Esta plantilla todavía no tiene diagramas de referencia cargados. Puedes agregarlos desde{' '}
        <Link to={`/plantillas/${plantillaId}`} className="text-brand dark:text-brand-cyan underline">
          Plantillas de equipo
        </Link>
        .
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-2">
        {diagramas.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onSeleccionarDiagrama(d.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              diagramaActivo === d.id ? 'bg-brand text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {d.nombre}
          </button>
        ))}
      </div>

      {diagramaSeleccionado && (
        <div
          onClick={handleLienzoClick}
          className={`relative inline-block w-full overflow-hidden rounded-lg border border-slate-200 ${readOnly ? '' : 'cursor-crosshair'}`}
        >
          <img
            ref={imgRef}
            src={`/api/plantillas/${plantillaId}/diagramas/${diagramaSeleccionado.id}/imagen`}
            alt={diagramaSeleccionado.nombre}
            draggable={false}
            className="block w-full select-none"
          />
          {marcasDelDiagrama.map((m, i) => (
            <div
              key={m.id ?? i}
              onClick={(ev) => {
                ev.stopPropagation();
                if (!readOnly) onEliminarMarca?.(m);
              }}
              title={readOnly ? undefined : 'Toca para eliminar esta marca'}
              style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%` }}
              className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-red-600 text-sm font-extrabold text-white shadow ${
                readOnly ? '' : 'cursor-pointer'
              }`}
            >
              {etiquetaMarca}
            </div>
          ))}
          {/* Referencia de la zona elegida (no es una marca; solo orienta al inspector) */}
          {zonaConCoordenadas && zonaConCoordenadas.diagrama_id === diagramaActivo && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${zonaConCoordenadas.coord_x! * 100}%`, top: `${zonaConCoordenadas.coord_y! * 100}%` }}
              aria-hidden="true"
            >
              <span className="absolute -left-4 -top-4 h-8 w-8 animate-ping rounded-full bg-brand opacity-50" />
              <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-white bg-brand shadow" />
            </span>
          )}
        </div>
      )}

      {ayuda && <p className="mt-2 text-sm text-slate-500">{ayuda}</p>}
    </div>
  );
}
