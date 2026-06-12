import { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Una zona técnica del catálogo de la plantilla (tabla `zonas` en SQLite)
export interface Zona {
  id: number;
  sistema: string;
  sector: string;
  codigo: string;
  descripcion: string | null;
  criticidad_base: 'alta' | 'media' | 'baja' | null;
  diagrama_id: number | null;
  coord_x: number | null;
  coord_y: number | null;
}

export interface ZonaSeleccion {
  sistema: string;
  sector: string;
  codigo: string;
  zona_id: number | null;
}

interface Props {
  zonas: Zona[];
  valor: ZonaSeleccion;
  onChange: (seleccion: ZonaSeleccion, zona: Zona | null) => void;
  /** Criticidad ya elegida por el inspector; si difiere de la sugerida por la zona se ofrece corregirla */
  criticidadActual?: 'alta' | 'media' | 'baja' | null;
  onAplicarCriticidad?: (c: 'alta' | 'media' | 'baja') => void;
  disabled?: boolean;
}

const ETIQUETA: Record<string, string> = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' };

export default function ZonaSelector({ zonas, valor, onChange, criticidadActual, onAplicarCriticidad, disabled }: Props) {
  const sistemas = useMemo(() => [...new Set(zonas.map((z) => z.sistema))], [zonas]);
  const sectores = useMemo(
    () => [...new Set(zonas.filter((z) => z.sistema === valor.sistema).map((z) => z.sector))],
    [zonas, valor.sistema]
  );
  const codigos = useMemo(
    () => zonas.filter((z) => z.sistema === valor.sistema && z.sector === valor.sector),
    [zonas, valor.sistema, valor.sector]
  );

  // Zona cuya sugerencia de criticidad el inspector ya descartó con "Mantener"
  const [sugerenciaDescartada, setSugerenciaDescartada] = useState<number | null>(null);

  const zonaElegida = valor.zona_id != null ? zonas.find((z) => z.id === valor.zona_id) || null : null;
  const sugerida = zonaElegida?.criticidad_base || null;
  const difiere =
    !!sugerida && !!criticidadActual && sugerida !== criticidadActual && sugerenciaDescartada !== valor.zona_id;

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <Label>Sistema</Label>
        <Select
          value={valor.sistema}
          disabled={disabled}
          onValueChange={(v) => onChange({ sistema: v, sector: '', codigo: '', zona_id: null }, null)}
        >
          <SelectTrigger className="h-14 bg-card text-base">
            <SelectValue placeholder="Toca para elegir el sistema" />
          </SelectTrigger>
          <SelectContent>
            {sistemas.map((s) => (
              <SelectItem key={s} value={s} className="py-3 text-base">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Sector</Label>
        <Select
          value={valor.sector}
          disabled={disabled || !valor.sistema}
          onValueChange={(v) => onChange({ sistema: valor.sistema, sector: v, codigo: '', zona_id: null }, null)}
        >
          <SelectTrigger className="h-14 bg-card text-base">
            <SelectValue placeholder={valor.sistema ? 'Toca para elegir el sector' : 'Selecciona primero el sistema'} />
          </SelectTrigger>
          <SelectContent>
            {sectores.map((s) => (
              <SelectItem key={s} value={s} className="py-3 text-base">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Código de zona</Label>
        {!valor.sector ? (
          <p className="rounded-md bg-slate-100 px-3 py-3 text-sm text-slate-400">
            {valor.sistema ? 'Selecciona primero el sector' : 'Selecciona primero el sistema'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {codigos.map((z) => (
              <button
                key={z.id}
                type="button"
                disabled={disabled}
                aria-pressed={valor.zona_id === z.id}
                onClick={() =>
                  onChange({ sistema: z.sistema, sector: z.sector, codigo: z.codigo, zona_id: z.id }, z)
                }
                className={`flex min-h-[56px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 px-2 py-1.5 transition-colors ${
                  valor.zona_id === z.id
                    ? 'border-brand bg-accent text-accent-foreground'
                    : 'border-slate-200 bg-card text-slate-900 active:border-brand'
                }`}
              >
                <span className="font-heading text-sm font-bold tracking-wide">{z.codigo}</span>
                {z.descripcion && <span className="mt-0.5 text-center text-xs leading-tight text-slate-600">{z.descripcion}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sugerencia de criticidad de la zona elegida */}
      {difiere && onAplicarCriticidad && !disabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3" role="alert">
          <p className="mb-2 text-sm font-medium text-amber-900">
            Esta zona suele tener criticidad {ETIQUETA[sugerida!]}. ¿Confirmas?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAplicarCriticidad(sugerida!)}
              className="h-12 flex-1 cursor-pointer rounded-full bg-brand font-heading text-sm font-medium text-white transition-colors hover:bg-brand-teal"
            >
              Usar {ETIQUETA[sugerida!]}
            </button>
            <button
              type="button"
              onClick={() => setSugerenciaDescartada(valor.zona_id)}
              className="h-12 flex-1 cursor-pointer rounded-full border border-input bg-card font-heading text-sm font-medium text-slate-900 transition-colors hover:bg-secondary"
            >
              Mantener {ETIQUETA[criticidadActual!]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
