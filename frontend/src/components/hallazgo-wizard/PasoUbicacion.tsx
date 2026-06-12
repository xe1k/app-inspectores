import { AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ZonaSelector, { type Zona } from '@/components/ZonaSelector';
import { SISTEMAS, SECTORES_POR_SISTEMA, type DatosHallazgo } from './datos';

// Ayuda contextual según la criticidad elegida en el paso 1
const AYUDA_TIEMPO: Record<string, string> = {
  alta: 'Hallazgos críticos deben atenderse en menos de 72 horas.',
  media: 'Puede planificarse en el próximo mantenimiento programado.',
  baja: 'Puede resolverse en la próxima parada mayor.',
};

interface Props {
  datos: DatosHallazgo;
  actualizar: (parcial: Partial<DatosHallazgo>) => void;
  onContinuar: () => void;
  /** Catálogo de zonas de la plantilla; si está vacío se usan los catálogos genéricos */
  zonas: Zona[];
}

export default function PasoUbicacion({ datos, actualizar, onContinuar, zonas }: Props) {
  const conZonas = zonas.length > 0;

  const sistemaEsOtro = datos.sistema === 'Otro';
  const sectores = sistemaEsOtro ? [] : SECTORES_POR_SISTEMA[datos.sistema] || [];
  const sectorEsOtro = datos.sector === 'Otro';

  const sistemaListo = sistemaEsOtro ? !!datos.sistemaOtro.trim() : !!datos.sistema;
  const sectorListo = sistemaEsOtro
    ? !!datos.sectorOtro.trim()
    : sectorEsOtro
      ? !!datos.sectorOtro.trim()
      : !!datos.sector;
  const puedeContinuar = conZonas ? datos.zonaId != null : sistemaListo && sectorListo;

  // Para la advertencia de criticidad ALTA: sin horas ni personas estimadas
  const sinEstimacion =
    (!datos.tiempoHrs.trim() || Number(datos.tiempoHrs) === 0) &&
    (!datos.recursosCantidad.trim() || Number(datos.recursosCantidad) === 0);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold text-slate-900">¿Dónde está el daño?</h2>

      {conZonas ? (
        <ZonaSelector
          zonas={zonas}
          valor={{ sistema: datos.sistema, sector: datos.sector, codigo: datos.codigo, zona_id: datos.zonaId }}
          onChange={(sel) =>
            actualizar({ sistema: sel.sistema, sector: sel.sector, codigo: sel.codigo, zonaId: sel.zona_id })
          }
          criticidadActual={datos.criticidad}
          onAplicarCriticidad={(c) => actualizar({ criticidad: c })}
        />
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Sistema</Label>
            <Select
              value={datos.sistema}
              onValueChange={(v) => actualizar({ sistema: v, sector: '', sectorOtro: '' })}
            >
              <SelectTrigger className="h-14 bg-card text-base">
                <SelectValue placeholder="Toca para elegir el sistema" />
              </SelectTrigger>
              <SelectContent>
                {SISTEMAS.map((s) => (
                  <SelectItem key={s} value={s} className="py-3 text-base">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sistemaEsOtro && (
              <Input
                className="mt-2 h-14 bg-card text-base"
                placeholder="¿Qué sistema es?"
                value={datos.sistemaOtro}
                onChange={(e) => actualizar({ sistemaOtro: e.target.value })}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Sector</Label>
            {sistemaEsOtro ? (
              <Input
                className="h-14 bg-card text-base"
                placeholder="¿En qué sector está?"
                value={datos.sectorOtro}
                onChange={(e) => actualizar({ sectorOtro: e.target.value })}
              />
            ) : (
              <Select
                value={datos.sector}
                onValueChange={(v) => actualizar({ sector: v })}
                disabled={!datos.sistema}
              >
                <SelectTrigger className="h-14 bg-card text-base">
                  <SelectValue placeholder={datos.sistema ? 'Toca para elegir el sector' : 'Primero elige el sistema'} />
                </SelectTrigger>
                <SelectContent>
                  {sectores.map((s) => (
                    <SelectItem key={s} value={s} className="py-3 text-base">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!sistemaEsOtro && sectorEsOtro && (
              <Input
                className="mt-2 h-14 bg-card text-base"
                placeholder="¿Qué sector es?"
                value={datos.sectorOtro}
                onChange={(e) => actualizar({ sectorOtro: e.target.value })}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="codigo">Código técnico (opcional)</Label>
            <Input
              id="codigo"
              className="h-14 bg-card text-base uppercase"
              placeholder="ej. ZA01LHO"
              autoCapitalize="characters"
              value={datos.codigo}
              onChange={(e) => actualizar({ codigo: e.target.value })}
            />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tiempoHrs">Tiempo estimado (horas)</Label>
          <Input
            id="tiempoHrs"
            type="number"
            inputMode="numeric"
            min="0"
            max="999"
            className="h-14 bg-card text-base"
            placeholder="ej. 12"
            value={datos.tiempoHrs}
            onChange={(e) => actualizar({ tiempoHrs: e.target.value })}
          />
          {datos.criticidad && <p className="text-sm text-slate-500">{AYUDA_TIEMPO[datos.criticidad]}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recursosCantidad">Personas requeridas</Label>
          <Input
            id="recursosCantidad"
            type="number"
            inputMode="numeric"
            min="0"
            max="99"
            className="h-14 bg-card text-base"
            placeholder="ej. 2"
            value={datos.recursosCantidad}
            onChange={(e) => actualizar({ recursosCantidad: e.target.value })}
          />
        </div>
      </div>

      {/* Solo advertencia para hallazgos críticos sin estimación; no bloquea */}
      {datos.criticidad === 'alta' && sinEstimacion && (
        <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Se recomienda estimar horas y personas para hallazgos críticos.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>¿El daño ya existía antes (preexistencia)?</Label>
        <div className="flex gap-3">
          {(
            [
              { valor: 'si', etiqueta: 'Sí' },
              { valor: 'no', etiqueta: 'No' },
            ] as const
          ).map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => actualizar({ preexistencia: datos.preexistencia === o.valor ? null : o.valor })}
              aria-pressed={datos.preexistencia === o.valor}
              className={`h-14 flex-1 cursor-pointer rounded-2xl border-2 font-heading text-lg font-semibold transition-colors ${
                datos.preexistencia === o.valor
                  ? 'border-brand bg-accent text-accent-foreground'
                  : 'border-slate-200 bg-card text-slate-600'
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!puedeContinuar}
        onClick={onContinuar}
        className="mt-auto h-14 w-full cursor-pointer rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal disabled:pointer-events-none disabled:opacity-50"
      >
        Continuar →
      </button>
    </div>
  );
}
