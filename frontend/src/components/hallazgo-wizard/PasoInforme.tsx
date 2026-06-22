import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DatosHallazgo } from './datos';

interface Props {
  datos: DatosHallazgo;
  actualizar: (parcial: Partial<DatosHallazgo>) => void;
  onContinuar: () => void;
}

// El teclado del celular puede tapar el campo activo: al enfocar, lo
// centramos en la pantalla.
function scrollIntoView(e: React.FocusEvent<HTMLTextAreaElement>) {
  const el = e.target;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
}

export default function PasoInforme({ datos, actualizar, onContinuar }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="font-heading text-xl font-semibold text-slate-900">Informe</h2>
      <p className="-mt-2 text-sm text-slate-500">
        Deja el informe listo: describe el daño, el trabajo a realizar y tu recomendación.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="descripcionDano">Observación / descripción del daño</Label>
        <Textarea
          id="descripcionDano"
          rows={4}
          className="bg-card text-base"
          placeholder="Describe lo observado: tipo de daño, dimensiones, ubicación exacta…"
          value={datos.descripcionDano}
          onChange={(e) => actualizar({ descripcionDano: e.target.value })}
          onFocus={scrollIntoView}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="trabajoRealizar">Trabajo a realizar</Label>
        <Textarea
          id="trabajoRealizar"
          rows={3}
          className="bg-card text-base"
          placeholder="ej. Reparación mediante procedimiento X, cambio de pieza, evaluación por fabricante…"
          value={datos.trabajoRealizar}
          onChange={(e) => actualizar({ trabajoRealizar: e.target.value })}
          onFocus={scrollIntoView}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recomendacion">Recomendación</Label>
        <Textarea
          id="recomendacion"
          rows={3}
          className="bg-card text-base"
          placeholder="ej. Apoyo con plataforma, sector limpio, repuesto adecuado…"
          value={datos.recomendacion}
          onChange={(e) => actualizar({ recomendacion: e.target.value })}
          onFocus={scrollIntoView}
        />
      </div>

      <button
        type="button"
        onClick={onContinuar}
        className="mt-auto h-14 w-full cursor-pointer rounded-full bg-brand font-heading text-base font-medium text-white transition-colors hover:bg-brand-teal"
      >
        Continuar →
      </button>
    </div>
  );
}
